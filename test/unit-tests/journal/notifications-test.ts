/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { JournalApiError } from "../../../src/journal/api";
import { type LiveListener, MatronJournalClient } from "../../../src/journal/client";
import {
    allowedForDevice,
    allowedForUser,
    classifyEvent,
    DesktopNotifier,
    effectiveEvents,
    eventKey,
    type NotificationConstructorLike,
    type NotifierEnvironment,
    notificationsFor,
    NOTIFY_EVENTS,
    parseNotifySettings,
    parseNotifyView,
    shouldNotify,
    STALE_EVENT_MS,
    titleWithUnread,
    unreadTotal,
} from "../../../src/journal/notifications";
import { SettingsSheet } from "../../../src/journal/SettingsSheet";
import type { ClientState, Conversation, JournalEvent, Session } from "../../../src/journal/types";

const SESSION: Session = {
    serverUrl: "https://journal.example.com",
    token: "token",
    deviceId: 7,
    userId: 2,
    username: "alice",
};

const NOW = 1_800_000_000_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function conversation(id: string, overrides: Partial<Conversation> = {}): Conversation {
    return {
        id,
        title: `Chat ${id}`,
        session_state: "waiting",
        last_seq: 1,
        unread_count: 0,
        snippet: "",
        created_at: 1,
        read_up_to_seq: 1,
        ...overrides,
    };
}

let nextSeq = 100;
function event(overrides: Partial<JournalEvent> = {}): JournalEvent {
    nextSeq += 1;
    return {
        kind: "journal",
        seq: nextSeq,
        convo_id: "c2",
        ts: NOW,
        sender: "agent:3",
        type: "text",
        payload: { body: "Deploy finished" },
        ...overrides,
    };
}

const ALL_OFF = Object.fromEntries(NOTIFY_EVENTS.map((key) => [key, false]));

// ── Pure rules ───────────────────────────────────────────────────────────────────────────────

describe("notification settings parsing", () => {
    it("reads the view, defaulting the device level and filling missing switches", () => {
        const view = parseNotifyView({
            mode: "custom",
            events: { activity: true, prompts: false },
            has_coordinator: true,
            convos: [
                { convo_id: "c1", level: "needs_me", mute_until: null },
                { convo_id: "c2", level: "bogus", mute_until: NOW },
                { level: "all" },
            ],
        });
        expect(view).toEqual({
            mode: "custom",
            events: { ...ALL_OFF, prompts: true, notices: true, activity: true },
            has_coordinator: true,
            convos: [
                { convo_id: "c1", level: "needs_me", mute_until: null },
                { convo_id: "c2", level: null, mute_until: NOW },
            ],
            device_level: "all",
        });
    });

    it("rejects an unknown mode", () => {
        expect(parseNotifySettings({ mode: "loud" })).toBeNull();
        expect(parseNotifyView(null)).toBeNull();
    });

    it("treats Coordinator mode without a Coordinator as every session", () => {
        const settings = parseNotifySettings({ mode: "coordinator", events: { coordinator_done: true } })!;
        expect(effectiveEvents(settings).other_done).toBe(true);
        expect(effectiveEvents({ ...settings, has_coordinator: true }).other_done).toBe(false);
    });
});

describe("event classification", () => {
    it("never classifies the user's own events", () => {
        expect(classifyEvent(event({ sender: "user:2", type: "prompt" }), undefined)).toBeNull();
    });

    it("classifies prompts, questions and notices as needing the user", () => {
        expect(eventKey(classifyEvent(event({ type: "prompt" }), undefined)!, plain)).toBe("prompts");
        expect(eventKey(classifyEvent(event({ type: "permission_request" }), undefined)!, plain)).toBe("prompts");
        const item = { awaiting: "user", by: "agent", action: "created", kind: "question" };
        expect(eventKey(classifyEvent(event({ type: "item", payload: item }), undefined)!, plain)).toBe("questions");
        const notice = { ...item, kind: "notice" };
        expect(eventKey(classifyEvent(event({ type: "item", payload: notice }), undefined)!, plain)).toBe("notices");
        expect(classifyEvent(event({ type: "item", payload: { ...item, by: "user" } }), undefined)).toBeNull();
        expect(classifyEvent(event({ type: "item", payload: { ...item, action: "closed" } }), undefined)).toBeNull();
    });

    it("counts only a turn ending or a session stopping mid-work as done", () => {
        const waiting = event({ type: "session_status", payload: { state: "waiting" } });
        const done = event({ type: "session_status", payload: { state: "done" } });
        expect(eventKey(classifyEvent(waiting, "running")!, plain)).toBe("other_done");
        expect(eventKey(classifyEvent(waiting, "running")!, { isCoordinator: true, isRoom: false })).toBe(
            "coordinator_done",
        );
        expect(eventKey(classifyEvent(done, "running")!, plain)).toBe("stopped");
        expect(classifyEvent(done, "waiting")).toBeNull();
        expect(classifyEvent(waiting, undefined)).toBeNull();
    });

    it("leaves bookkeeping out and files everything else as activity", () => {
        for (const type of ["convo_meta", "summary", "milestone", "mission", "consent_decision"]) {
            expect(classifyEvent(event({ type }), undefined)).toBeNull();
        }
        expect(classifyEvent(event({ type: "text", payload: { fallback_for: "item" } }), undefined)).toBeNull();
        expect(eventKey(classifyEvent(event({ type: "tool_output" }), undefined)!, plain)).toBe("activity");
        expect(eventKey(classifyEvent(event(), undefined)!, { isCoordinator: false, isRoom: true })).toBe("rooms");
    });
});

const plain = { isCoordinator: false, isRoom: false };

describe("allowed rules", () => {
    const events = { ...ALL_OFF, prompts: true, questions: true } as Record<(typeof NOTIFY_EVENTS)[number], boolean>;

    it("applies a running mute and the conversation level ahead of the switches", () => {
        expect(allowedForUser("prompts", events, { convo_id: "c", level: null, mute_until: NOW + 1 }, NOW)).toBe(false);
        expect(allowedForUser("prompts", events, { convo_id: "c", level: null, mute_until: NOW - 1 }, NOW)).toBe(true);
        expect(allowedForUser("prompts", events, { convo_id: "c", level: "none", mute_until: null }, NOW)).toBe(false);
        expect(allowedForUser("other_done", events, { convo_id: "c", level: "all", mute_until: null }, NOW)).toBe(true);
        expect(allowedForUser("activity", events, { convo_id: "c", level: "all", mute_until: null }, NOW)).toBe(false);
        expect(allowedForUser("other_done", events, { convo_id: "c", level: "needs_me", mute_until: null }, NOW)).toBe(
            false,
        );
        expect(allowedForUser("other_done", events, undefined, NOW)).toBe(false);
    });

    it("applies this device's level", () => {
        expect(allowedForDevice("activity", "all")).toBe(true);
        expect(allowedForDevice("activity", "needs_me")).toBe(false);
        expect(allowedForDevice("notices", "needs_me")).toBe(true);
        expect(allowedForDevice("prompts", "off")).toBe(false);
    });

    it("falls back to what needs the user and agent messages without settings", () => {
        expect(shouldNotify("prompts", "prompt", "c", null, NOW)).toBe(true);
        expect(shouldNotify("activity", "text", "c", null, NOW)).toBe(true);
        expect(shouldNotify("activity", "tool_output", "c", null, NOW)).toBe(false);
        expect(shouldNotify("other_done", "session_status", "c", null, NOW)).toBe(false);
    });
});

describe("unread badge", () => {
    it("counts unread outside the archive, a hand-marked chat once", () => {
        const total = unreadTotal(
            [conversation("a", { unread_count: 2 }), conversation("b", { unread_count: 5 }), conversation("c")],
            new Set(["b"]),
            new Set(["c"]),
        );
        expect(total).toBe(3);
    });

    it("puts the count in front of the title", () => {
        expect(titleWithUnread("Matron", 3)).toBe("(3) Matron");
        expect(titleWithUnread("(3) Matron", 0)).toBe("Matron");
        expect(titleWithUnread("(3) Matron", 4)).toBe("(4) Matron");
    });
});

// ── The notifier ─────────────────────────────────────────────────────────────────────────────

interface Shown {
    title: string;
    options?: NotificationOptions & { renotify?: boolean };
    close: jest.Mock;
    onclick: ((event: Event) => unknown) | null;
}

function mockNotification(permission: NotificationPermission = "granted", answer: NotificationPermission = "granted") {
    const shown: Shown[] = [];
    class FakeNotification {
        public static permission: NotificationPermission = permission;
        public static requestPermission = jest.fn(async () => {
            FakeNotification.permission = answer;
            return answer;
        });
        public onclick: ((event: Event) => unknown) | null = null;
        public close = jest.fn();
        public constructor(
            public title: string,
            public options?: NotificationOptions,
        ) {
            shown.push(this as unknown as Shown);
        }
    }
    return { api: FakeNotification as unknown as NotificationConstructorLike & typeof FakeNotification, shown };
}

function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
        get length() {
            return map.size;
        },
        clear: () => map.clear(),
        getItem: (key) => map.get(key) ?? null,
        key: (index) => [...map.keys()][index] ?? null,
        removeItem: (key) => void map.delete(key),
        setItem: (key, value) => void map.set(key, String(value)),
    };
}

/** BroadcastChannel stand-in: every channel made from one bus hears the others, synchronously. */
function channelBus(): () => {
    postMessage: (m: unknown) => void;
    close: () => void;
    onmessage: ((e: MessageEvent) => void) | null;
} {
    const members = new Set<{ onmessage: ((e: MessageEvent) => void) | null }>();
    return () => {
        const channel = {
            onmessage: null as ((e: MessageEvent) => void) | null,
            postMessage: (message: unknown) => {
                for (const other of members) {
                    if (other !== channel) other.onmessage?.({ data: message } as MessageEvent);
                }
            },
            close: () => void members.delete(channel),
        };
        members.add(channel);
        return channel;
    };
}

interface Api {
    notifySettings: jest.Mock;
    coordinator: jest.Mock;
}

function notFoundApi(): Api {
    return {
        notifySettings: jest.fn().mockRejectedValue(new JournalApiError("not found", 404)),
        coordinator: jest.fn().mockResolvedValue({ convo_id: null }),
    };
}

function signedIn(client: MatronJournalClient, patch: Partial<ClientState> = {}): void {
    const internals = client as unknown as { state: ClientState; emit(): void };
    internals.state = {
        ...client.getSnapshot(),
        phase: "signed-in",
        session: SESSION,
        connection: "online",
        conversations: [conversation("c1"), conversation("c2", { unread_count: 2 }), conversation("c3")],
        selectedConversationId: "c1",
        ...patch,
    };
    internals.emit();
}

function deliver(client: MatronJournalClient, journalEvent: JournalEvent): void {
    const previous = client.getSnapshot().conversations.find((row) => row.id === journalEvent.convo_id);
    (client as unknown as { emitLive(call: (l: LiveListener) => void): void }).emitLive((listener) =>
        listener.journalEvent?.(journalEvent, previous),
    );
}

function frame(client: MatronJournalClient, value: unknown): void {
    (client as unknown as { emitLive(call: (l: LiveListener) => void): void }).emitLive((listener) =>
        listener.frame?.(value as never),
    );
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

function setup(
    options: {
        permission?: NotificationPermission;
        api?: Api;
        focused?: boolean;
        env?: Partial<NotifierEnvironment>;
    } = {},
) {
    const client = new MatronJournalClient();
    jest.spyOn(client, "selectConversation").mockResolvedValue(undefined);
    signedIn(client);
    const notification = mockNotification(options.permission ?? "granted");
    const api = options.api ?? notFoundApi();
    const focus = jest.fn();
    const doc = {
        title: "Matron",
        visibilityState: "visible",
        hasFocus: () => options.focused ?? false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    } as unknown as Document;
    const win = { focus, addEventListener: jest.fn(), removeEventListener: jest.fn() } as unknown as Window;
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    const clearAppBadge = jest.fn().mockResolvedValue(undefined);
    const notifier = new DesktopNotifier(client, {
        Notification: notification.api,
        locks: undefined,
        channel: () => undefined,
        storage: memoryStorage(),
        document: doc,
        window: win,
        now: () => NOW,
        setAppBadge,
        clearAppBadge,
        api: () => api,
        ...options.env,
    });
    return { client, notifier, notification, api, doc, focus, setAppBadge, clearAppBadge };
}

describe("DesktopNotifier", () => {
    it("puts the unread total in the title and the app badge, and takes it off on stop", () => {
        const { client, notifier, doc, setAppBadge, clearAppBadge } = setup();
        const stop = notifier.start();
        expect(doc.title).toBe("(2) Matron");
        expect(setAppBadge).toHaveBeenCalledWith(2);

        signedIn(client, {
            conversations: [conversation("c2", { unread_count: 2 })],
            archivedIds: new Set(["c2"]),
        });
        expect(doc.title).toBe("Matron");
        expect(clearAppBadge).toHaveBeenCalled();

        signedIn(client, { conversations: [conversation("c2", { unread_count: 4 })], archivedIds: new Set() });
        expect(doc.title).toBe("(4) Matron");
        stop();
        expect(doc.title).toBe("Matron");
    });

    it("notifies an agent message elsewhere without settings, and a click opens the conversation", async () => {
        const { client, notifier, notification, focus } = setup();
        notifier.start();
        await flush();
        deliver(client, event());
        expect(notification.shown).toHaveLength(1);
        const [shown] = notification.shown;
        expect(shown.title).toBe("Chat c2");
        expect(shown.options).toMatchObject({ body: "Deploy finished", tag: "matron:c2", silent: false });

        shown.onclick!(new Event("click"));
        expect(focus).toHaveBeenCalled();
        expect(client.selectConversation).toHaveBeenCalledWith("c2");
        expect(shown.close).toHaveBeenCalled();
    });

    it("stays quiet for the conversation on screen in a focused tab, but not for another one", async () => {
        const { client, notifier, notification } = setup({ focused: true });
        notifier.start();
        await flush();
        deliver(client, event({ convo_id: "c1" }));
        expect(notification.shown).toHaveLength(0);
        deliver(client, event({ convo_id: "c2", type: "prompt", payload: { question: "Ship it?" } }));
        expect(notification.shown).toHaveLength(1);
        expect(notification.shown[0].options).toMatchObject({ body: "? Ship it?", renotify: true });
    });

    it("notifies the conversation on screen when the tab is in the background", async () => {
        const { client, notifier, notification } = setup({ focused: false });
        notifier.start();
        await flush();
        deliver(client, event({ convo_id: "c1" }));
        expect(notification.shown).toHaveLength(1);
    });

    it("skips the user's own events, stale replays, tool output and subagent children", async () => {
        const { client, notifier, notification } = setup();
        signedIn(client, {
            conversations: [conversation("c2"), conversation("child", { parent_convo_id: "c2" })],
        });
        notifier.start();
        await flush();
        deliver(client, event({ sender: "user:2" }));
        deliver(client, event({ ts: NOW - STALE_EVENT_MS - 1 }));
        deliver(client, event({ type: "tool_output", payload: { output: "ok" } }));
        deliver(client, event({ convo_id: "child", type: "prompt" }));
        expect(notification.shown).toHaveLength(0);
    });

    it("follows the journal's settings: mode, Coordinator, mutes and the device level", async () => {
        const api: Api = {
            notifySettings: jest.fn().mockResolvedValue({
                mode: "coordinator",
                events: {
                    prompts: true,
                    questions: true,
                    notices: true,
                    coordinator_done: true,
                    other_done: false,
                    stopped: false,
                    rooms: false,
                    activity: false,
                },
                has_coordinator: true,
                device_level: "all",
                convos: [{ convo_id: "c3", level: null, mute_until: NOW + 60_000 }],
            }),
            coordinator: jest.fn().mockResolvedValue({ convo_id: "c1" }),
        };
        const { client, notifier, notification } = setup({ api });
        signedIn(client, {
            conversations: [
                conversation("c1", { session_state: "running" }),
                conversation("c2", { session_state: "running" }),
                conversation("c3"),
            ],
            selectedConversationId: undefined,
        });
        notifier.start();
        await flush();
        expect(api.notifySettings).toHaveBeenCalled();

        const turnEnded = { type: "session_status", payload: { state: "waiting" } };
        deliver(client, event({ convo_id: "c2" })); // activity: off
        deliver(client, event({ convo_id: "c2", ...turnEnded })); // another session done: off
        deliver(client, event({ convo_id: "c3", type: "prompt" })); // muted
        expect(notification.shown).toHaveLength(0);

        deliver(client, event({ convo_id: "c1", ...turnEnded })); // the Coordinator's turn ended
        deliver(client, event({ convo_id: "c2", type: "prompt", payload: { question: "Go?" } }));
        expect(notification.shown.map((shown) => shown.options?.body)).toEqual(["Turn finished", "? Go?"]);

        // A live frame changes the synced part; the device level from GET stays.
        frame(client, {
            kind: "notify",
            settings: { mode: "all", events: { activity: true }, has_coordinator: true, convos: [] },
        });
        deliver(client, event({ convo_id: "c3", type: "prompt" }));
        expect(notification.shown).toHaveLength(3);
    });

    it("lets nothing through on a device set to off", async () => {
        const api: Api = {
            notifySettings: jest.fn().mockResolvedValue({ mode: "all", device_level: "off" }),
            coordinator: jest.fn().mockResolvedValue({ convo_id: null }),
        };
        const { client, notifier, notification } = setup({ api });
        notifier.start();
        await flush();
        deliver(client, event({ type: "prompt" }));
        expect(notification.shown).toHaveLength(0);
    });

    it("shows nothing until the browser allows it, and nothing once turned off", async () => {
        const blocked = setup({ permission: "default" });
        blocked.notifier.start();
        deliver(blocked.client, event({ type: "prompt" }));
        expect(blocked.notification.shown).toHaveLength(0);
        expect(blocked.notifier.getSnapshot()).toEqual({ permission: "default", enabled: false, sound: true });

        const { client, notifier, notification } = setup();
        notifier.start();
        notifier.disable();
        deliver(client, event({ type: "prompt" }));
        expect(notification.shown).toHaveLength(0);
        expect(notifier.getSnapshot().enabled).toBe(false);
    });

    it("asks the browser on enable, and plays no sound once sound is off", async () => {
        const { client, notifier, notification } = setup({ permission: "default" });
        notifier.start();
        await act(async () => notifier.enable());
        expect(notification.api.requestPermission).toHaveBeenCalled();
        expect(notifier.getSnapshot()).toEqual({ permission: "granted", enabled: true, sound: true });

        notifier.setSound(false);
        deliver(client, event({ type: "prompt" }));
        expect(notification.shown[0].options?.silent).toBe(true);
    });

    it("shows each event in one tab only (localStorage claim)", async () => {
        const storage = memoryStorage();
        const a = setup({ env: { storage } });
        const b = setup({ env: { storage } });
        a.notifier.start();
        b.notifier.start();
        await flush();
        const once = event({ type: "prompt" });
        deliver(a.client, once);
        deliver(b.client, once);
        expect(a.notification.shown.length + b.notification.shown.length).toBe(1);
    });

    it("shows events only in the tab holding the leader lock", async () => {
        let held = false;
        const locks = {
            request: jest.fn((_name: string, callback: () => Promise<void>) => {
                if (held) return new Promise(() => undefined);
                held = true;
                return callback();
            }),
        };
        const a = setup({ env: { locks } });
        const b = setup({ env: { locks } });
        a.notifier.start();
        b.notifier.start();
        await flush();
        const once = event({ type: "prompt" });
        deliver(a.client, once);
        deliver(b.client, once);
        expect(a.notification.shown).toHaveLength(1);
        expect(b.notification.shown).toHaveLength(0);
    });

    it("stays quiet about a conversation another focused tab has on screen", async () => {
        const bus = channelBus();
        const background = setup({ focused: false, env: { channel: bus } });
        const front = setup({ focused: true, env: { channel: bus } });
        signedIn(front.client, { selectedConversationId: "c2" });
        background.notifier.start();
        front.notifier.start();
        await flush();
        deliver(background.client, event({ convo_id: "c2", type: "prompt" }));
        expect(background.notification.shown).toHaveLength(0);
        deliver(background.client, event({ convo_id: "c3", type: "prompt" }));
        expect(background.notification.shown).toHaveLength(1);
    });
});

describe("Settings → Notifications", () => {
    const original = (globalThis as { Notification?: unknown }).Notification;
    afterEach(() => {
        (globalThis as { Notification?: unknown }).Notification = original;
        window.localStorage.clear();
    });

    async function renderSheet(client: MatronJournalClient): Promise<HTMLDivElement> {
        const container = document.createElement("div");
        document.body.append(container);
        await act(async () => {
            createRoot(container).render(
                React.createElement(SettingsSheet, {
                    client,
                    session: SESSION,
                    connection: "online",
                    onSignOut: () => undefined,
                    onClose: () => undefined,
                }),
            );
        });
        return container;
    }

    it("turns notifications on from the switch, asking the browser", async () => {
        const notification = mockNotification("default");
        (globalThis as { Notification?: unknown }).Notification = notification.api;
        const client = new MatronJournalClient();
        jest.spyOn(client, "showDefaults").mockReturnValue(() => undefined);
        jest.spyOn(client, "showBoxDefaults").mockReturnValue(() => undefined);
        const container = await renderSheet(client);
        const toggle = container.querySelector<HTMLButtonElement>('[data-setting="desktop-notifications"]')!;
        const sound = container.querySelector<HTMLButtonElement>('[data-setting="notification-sound"]')!;
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        expect(sound.disabled).toBe(true);
        expect(container.textContent).toContain("Your browser will ask to allow notifications");

        await act(async () => toggle.click());
        expect(notification.api.requestPermission).toHaveBeenCalled();
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        expect(sound.disabled).toBe(false);
        expect(container.textContent).toContain("Allowed in this browser.");

        await act(async () => sound.click());
        expect(sound.getAttribute("aria-checked")).toBe("false");
        expect(notificationsFor(client).getSnapshot().sound).toBe(false);
    });

    it("says when the browser blocks or lacks notifications", async () => {
        (globalThis as { Notification?: unknown }).Notification = mockNotification("denied").api;
        const denied = await renderSheet(new MatronJournalClient());
        expect(denied.querySelector<HTMLButtonElement>('[data-setting="desktop-notifications"]')!.disabled).toBe(true);
        expect(denied.textContent).toContain("Blocked in this browser.");

        delete (globalThis as { Notification?: unknown }).Notification;
        const unsupported = await renderSheet(new MatronJournalClient());
        expect(unsupported.textContent).toContain("This browser can't show notifications.");
    });
});
