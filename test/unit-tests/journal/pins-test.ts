/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { JournalApiError } from "../../../src/journal/api";
import { MatronJournalClient, pinnedStore } from "../../../src/journal/client";
import {
    markPinImportDone,
    movedPinOrder,
    parsePinList,
    parsePinsResponse,
    pinChooserBoxes,
    pinChooserView,
    pinErrorMessage,
    pinGlyph,
    pinImportDone,
    pinImportStorageKey,
    pinLabelFromTitle,
    pinsFromContainer,
    planPinImport,
    readCachedPins,
    successorHintText,
} from "../../../src/journal/pins";
import type { ClientState, Conversation, ConvoPin, ServerFrame, Session } from "../../../src/journal/types";

const SESSION: Session = {
    serverUrl: "https://journal.example",
    token: "t",
    deviceId: 1,
    userId: 2,
    username: "alice",
};

const rawPin = (convoId: string, position: number, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    convo_id: convoId,
    label: `Pin ${convoId}`,
    emoji: "",
    position,
    device_id: 7,
    created_at: 1,
    updated_at: 2,
    ...over,
});

const pin = (convoId: string, position: number, over: Partial<ConvoPin> = {}): ConvoPin => ({
    convo_id: convoId,
    label: `Pin ${convoId}`,
    emoji: "",
    position,
    device_id: 7,
    created_at: 1,
    updated_at: 2,
    ...over,
});

const convo = (id: string, title: string, over: Partial<Conversation> = {}): Conversation => ({
    id,
    title,
    session_state: "idle",
    last_seq: 1,
    unread_count: 0,
    snippet: "",
    created_at: 1,
    read_up_to_seq: 1,
    ...over,
});

describe("pin parsing", () => {
    it("reads pins from a snapshot body in position order, dropping malformed rows", () => {
        const pins = pinsFromContainer({
            conversations: [],
            seq: 4,
            pins: [
                rawPin("b", 2, { missing: true }),
                rawPin("a", 1, { successor: { convo_id: "a2", title: "Later", created_at: 9 } }),
                { convo_id: "x" },
                "junk",
                rawPin("a", 3),
            ],
        });
        expect(pins?.map((entry) => entry.convo_id)).toEqual(["a", "b"]);
        expect(pins?.[0].successor).toEqual({ convo_id: "a2", title: "Later", created_at: 9 });
        expect(pins?.[1].missing).toBe(true);
        expect(pins?.[0].missing).toBeUndefined();
    });

    it("reads pins from a hello_ok control frame", () => {
        expect(pinsFromContainer({ kind: "control", op: "hello_ok", pins: [rawPin("a", 0)] })).toHaveLength(1);
        expect(pinsFromContainer({ kind: "control", op: "hello_ok", pins: [] })).toEqual([]);
    });

    it("treats an absent (or unusable) pins key as unsupported", () => {
        expect(pinsFromContainer({ conversations: [], seq: 1 })).toBeNull();
        expect(pinsFromContainer({ kind: "control", op: "hello_ok" })).toBeNull();
        expect(pinsFromContainer({ pins: "nope" })).toBeNull();
        expect(pinsFromContainer(undefined)).toBeNull();
    });

    it("parses a /pins response and its limit, rejecting a body with no list", () => {
        expect(parsePinsResponse({ pins: [rawPin("a", 0)], limit: 5 })).toMatchObject({ limit: 5 });
        expect(parsePinsResponse({ pins: [] }).limit).toBe(5);
        expect(() => parsePinsResponse({ error: "x" })).toThrow();
        expect(parsePinList(null)).toBeUndefined();
    });

    it("draws the emoji, else the label's first letter", () => {
        expect(pinGlyph({ emoji: "🚀", label: "deploy" })).toBe("🚀");
        expect(pinGlyph({ emoji: "", label: "deploy" })).toBe("D");
    });
});

describe("pin errors", () => {
    it("words the 409 pin_limit as an inline error", () => {
        const error = new JournalApiError("conflict", 409, "conflict", undefined, {
            error: "conflict",
            detail: "pin_limit",
            limit: 5,
        });
        expect(pinErrorMessage(error)).toBe("You can pin up to 5 chats.");
        expect(
            pinErrorMessage(new JournalApiError("conflict", 409, "conflict", undefined, { detail: "already_pinned" })),
        ).toBe("That chat is already pinned.");
    });
});

describe("pin import labels", () => {
    it("strips the marker and [xx] short, and trims to 24 characters", () => {
        expect(pinLabelFromTitle("🐣 [ab] Deploy the thing")).toBe("Deploy the thing");
        expect(pinLabelFromTitle("[ab] An extremely long conversation title here")).toBe("An extremely long conver");
        expect(pinLabelFromTitle("[WIP] thing")).toBe("[WIP] thing");
        expect(pinLabelFromTitle("   ")).toBe("Pinned chat");
        expect(pinLabelFromTitle("line one\nline two")).toBe("line one line two");
    });

    it("plans locally pinned chats in list order, skipping journal pins, within the limit", () => {
        const conversations = ["c1", "c2", "c3", "c4", "c5", "c6"].map((id) => convo(id, `[ab] Chat ${id}`));
        const plan = planPinImport(new Set(["c6", "c2", "c1", "c4", "gone"]), conversations, [pin("c1", 0)], 3);
        expect(plan).toEqual([
            { convo_id: "c2", label: "Chat c2" },
            { convo_id: "c4", label: "Chat c4" },
        ]);
    });

    it("keeps the once-only flag per server and user", () => {
        localStorage.clear();
        expect(pinImportDone(SESSION)).toBe(false);
        markPinImportDone(SESSION);
        expect(pinImportDone(SESSION)).toBe(true);
        expect(pinImportDone({ ...SESSION, userId: 3 })).toBe(false);
        expect(pinImportStorageKey(SESSION)).toBe("matron_journal_pins_imported_v1:https%3A%2F%2Fjournal.example:2");
    });
});

describe("pin ordering", () => {
    const pins = [pin("a", 0), pin("b", 1), pin("c", 2)];

    it("moves a pin one step up or down", () => {
        expect(movedPinOrder(pins, "b", "up")).toEqual(["b", "a", "c"]);
        expect(movedPinOrder(pins, "b", "down")).toEqual(["a", "c", "b"]);
    });

    it("swaps with the nearest shown pin, leaving a hidden one in place", () => {
        const pins = [pin("a", 0), pin("b", 1), pin("c", 2)];
        expect(movedPinOrder(pins, "a", "down", ["a", "c"])).toEqual(["c", "b", "a"]);
        expect(movedPinOrder(pins, "c", "down", ["a", "c"])).toBeUndefined();
    });

    it("refuses moves off either end or for an unknown pin", () => {
        expect(movedPinOrder(pins, "a", "up")).toBeUndefined();
        expect(movedPinOrder(pins, "c", "down")).toBeUndefined();
        expect(movedPinOrder(pins, "z", "up")).toBeUndefined();
    });
});

describe("successor hint", () => {
    const agents = [
        { device_id: 7, name: "maple" },
        { device_id: 8, name: "ash" },
    ];
    const successor = { convo_id: "next", title: "Next", created_at: 3 };

    it("names the successor conversation's box", () => {
        expect(
            successorHintText(pin("a", 0, { successor }), [convo("next", "Next", { agent_device_id: 8 })], agents),
        ).toBe("New session on ash — move pin here?");
    });

    it("falls back to the pin's box, then to 'this box'", () => {
        expect(successorHintText(pin("a", 0, { successor }), [], agents)).toBe("New session on maple — move pin here?");
        expect(successorHintText(pin("a", 0, { successor, device_id: null }), [], agents)).toBe(
            "New session on this box — move pin here?",
        );
    });
});

describe("Move pin chooser box filter", () => {
    const agents = [
        { device_id: 7, name: "maple" },
        { device_id: 8, name: "ash" },
        { device_id: 9, name: "  " },
    ];
    const candidates = [
        convo("m1", "Deploy nginx", { agent_device_id: 7 }),
        convo("a1", "Deploy api", { agent_device_id: 8 }),
        convo("m2", "Logs", { agent_device_id: 7 }),
        convo("u1", "Unnamed box", { agent_device_id: 9 }),
        convo("x1", "Unknown box", { agent_device_id: 42 }),
        convo("l1", "Legacy row"),
    ];
    const ids = (conversations: Conversation[]): string[] => conversations.map((conversation) => conversation.id);

    it("lists the named boxes by name with their candidate counts", () => {
        expect(pinChooserBoxes(candidates, agents)).toEqual([
            { name: "ash", count: 1 },
            { name: "maple", count: 2 },
        ]);
        expect(pinChooserBoxes(candidates, undefined)).toEqual([]);
    });

    it("offers no filter when the candidates run on fewer than two named boxes", () => {
        const oneBox = candidates.filter((conversation) => conversation.agent_device_id !== 8);
        const view = pinChooserView(oneBox, agents, "", "maple");
        expect(view.boxes).toEqual([]);
        expect(view.box).toBeNull();
        expect(ids(view.conversations)).toEqual(ids(oneBox));
    });

    it("narrows to the chosen box, leaving out conversations with no named box", () => {
        const view = pinChooserView(candidates, agents, "", "maple");
        expect(view.box).toBe("maple");
        expect(ids(view.conversations)).toEqual(["m1", "m2"]);
        expect(ids(pinChooserView(candidates, agents, "", null).conversations)).toEqual(ids(candidates));
    });

    it("combines the box with the title query", () => {
        expect(ids(pinChooserView(candidates, agents, "  DEPLOY ", "maple").conversations)).toEqual(["m1"]);
        expect(ids(pinChooserView(candidates, agents, "deploy", null).conversations)).toEqual(["m1", "a1"]);
        // The options come from every candidate, so a query matching one box keeps both on offer.
        expect(pinChooserView(candidates, agents, "logs", "ash").boxes.map((option) => option.name)).toEqual([
            "ash",
            "maple",
        ]);
        expect(pinChooserView(candidates, agents, "logs", "ash").conversations).toEqual([]);
    });

    it("falls back to All when the chosen box has no candidates left", () => {
        const view = pinChooserView(candidates, agents, "", "gone");
        expect(view.box).toBeNull();
        expect(ids(view.conversations)).toEqual(ids(candidates));
    });
});

interface PinApiMock {
    putPin: jest.Mock;
    reorderPins: jest.Mock;
    deletePin: jest.Mock;
}

interface Internals {
    state: ClientState;
    api?: PinApiMock;
    handleFrame(frame: ServerFrame): Promise<void>;
    handleReady(hello?: unknown): Promise<void>;
}

function makeClient(conversations: Conversation[] = []): { client: MatronJournalClient; internals: Internals } {
    const client = new MatronJournalClient();
    const internals = client as unknown as Internals;
    internals.state = {
        ...client.getSnapshot(),
        phase: "signed-in",
        session: SESSION,
        conversations,
        pinnedIds: pinnedStore.read(SESSION).ids,
    };
    internals.api = { putPin: jest.fn(), reorderPins: jest.fn(), deletePin: jest.fn() };
    return { client, internals };
}

const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe("MatronJournalClient journal pins", () => {
    beforeEach(() => localStorage.clear());

    it("starts unsupported and adopts pins from hello_ok", async () => {
        const { client, internals } = makeClient();
        expect(client.getSnapshot().journalPins).toBeNull();
        await internals.handleReady({ kind: "control", op: "hello_ok", pins: [rawPin("a", 0)] });
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["a"]);
    });

    it("keeps local pins when hello_ok has no pins key (older journal)", async () => {
        pinnedStore.write(SESSION, new Set(["c1"]));
        const { client, internals } = makeClient([convo("c1", "Chat")]);
        await internals.handleReady({ kind: "control", op: "hello_ok" });
        await flush();
        expect(client.getSnapshot().journalPins).toBeNull();
        expect(internals.api!.putPin).not.toHaveBeenCalled();
        expect(client.getSnapshot().pinnedIds).toEqual(new Set(["c1"]));
    });

    it("replaces the list from a live pins frame", async () => {
        const { client, internals } = makeClient();
        await internals.handleFrame({ kind: "pins", pins: [rawPin("b", 1), rawPin("a", 0)] });
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["a", "b"]);
    });

    it("imports local pins once, then clears the local set", async () => {
        pinnedStore.write(SESSION, new Set(["c2", "c1"]));
        const { client, internals } = makeClient([convo("c1", "🐣 [ab] First"), convo("c2", "Second")]);
        internals.api!.putPin.mockImplementation(async (id: string, body: { label: string }) => ({
            pins: [rawPin(id, 0, { label: body.label })],
            limit: 5,
        }));
        await internals.handleFrame({ kind: "pins", pins: [] });
        await flush();
        expect(internals.api!.putPin.mock.calls).toEqual([
            ["c1", { label: "First", emoji: "" }],
            ["c2", { label: "Second", emoji: "" }],
        ]);
        expect(pinnedStore.read(SESSION).ids.size).toBe(0);
        expect(client.getSnapshot().pinnedIds.size).toBe(0);
        expect(pinImportDone(SESSION)).toBe(true);
        // The sidebar switches to the journal's list only once the import has landed.
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["c2"]);

        // A later session for the same server+user never imports again, even with a local set.
        pinnedStore.write(SESSION, new Set(["c1"]));
        const second = makeClient([convo("c1", "First")]);
        await second.internals.handleFrame({ kind: "pins", pins: [] });
        await flush();
        expect(second.internals.api!.putPin).not.toHaveBeenCalled();
    });

    it("leaves the local set intact when an import PUT fails", async () => {
        pinnedStore.write(SESSION, new Set(["c1"]));
        const { client, internals } = makeClient([convo("c1", "First")]);
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        internals.api!.putPin.mockRejectedValue(new JournalApiError("boom", 500));
        await internals.handleFrame({ kind: "pins", pins: [] });
        await flush();
        expect(pinnedStore.read(SESSION).ids).toEqual(new Set(["c1"]));
        expect(client.getSnapshot().pinnedIds).toEqual(new Set(["c1"]));
        // The sidebar stays on the browser-local pins rather than an empty journal list.
        expect(client.getSnapshot().journalPins).toBeNull();
        expect(pinImportDone(SESSION)).toBe(false);
        expect(warn).toHaveBeenCalledWith("matron: pin import stopped", "boom");
        warn.mockRestore();
    });

    it("keeps showing the local pins while the import is in flight", async () => {
        pinnedStore.write(SESSION, new Set(["c1"]));
        const { client, internals } = makeClient([convo("c1", "First")]);
        let finish: (value: unknown) => void = () => undefined;
        internals.api!.putPin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        await internals.handleFrame({ kind: "pins", pins: [rawPin("x", 0)] });
        await flush();
        expect(client.getSnapshot().journalPins).toBeNull();
        expect(client.getSnapshot().pinnedIds).toEqual(new Set(["c1"]));
        finish({ pins: [rawPin("x", 0), rawPin("c1", 1)], limit: 5 });
        await flush();
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["x", "c1"]);
    });

    it("caches the adopted list for the next start, and drops it for a journal without pins", async () => {
        const { internals } = makeClient();
        await internals.handleFrame({ kind: "pins", pins: [rawPin("a", 0)] });
        expect(readCachedPins(SESSION)?.map((entry) => entry.convo_id)).toEqual(["a"]);
        await internals.handleReady({ kind: "control", op: "hello_ok" });
        expect(readCachedPins(SESSION)).toBeNull();
    });

    it("retries a failed import on the next pin list from the journal", async () => {
        pinnedStore.write(SESSION, new Set(["c1"]));
        const { client, internals } = makeClient([convo("c1", "First")]);
        const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        internals.api!.putPin.mockRejectedValueOnce(new JournalApiError("boom", 500));
        internals.api!.putPin.mockResolvedValueOnce({ pins: [rawPin("c1", 0)], limit: 5 });
        await internals.handleFrame({ kind: "pins", pins: [] });
        await flush();
        expect(client.getSnapshot().journalPins).toBeNull();
        await internals.handleFrame({ kind: "pins", pins: [] });
        await flush();
        expect(internals.api!.putPin).toHaveBeenCalledTimes(2);
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["c1"]);
        expect(pinImportDone(SESSION)).toBe(true);
        warn.mockRestore();
    });

    it("keeps an adopted list current while a later local pin is imported", async () => {
        const { client, internals } = makeClient([convo("c1", "First")]);
        await internals.handleFrame({ kind: "pins", pins: [rawPin("a", 0)] });
        pinnedStore.write(SESSION, new Set(["c1"]));
        let finish: (value: unknown) => void = () => undefined;
        internals.api!.putPin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
        await internals.handleFrame({ kind: "pins", pins: [rawPin("a", 0), rawPin("b", 1)] });
        await flush();
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["a", "b"]);
        finish({ pins: [rawPin("a", 0), rawPin("b", 1), rawPin("c1", 2)], limit: 5 });
        await flush();
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["a", "b", "c1"]);
    });

    it("returns the pin_limit message from savePin", async () => {
        const { client, internals } = makeClient();
        internals.api!.putPin.mockRejectedValue(
            new JournalApiError("conflict", 409, "conflict", undefined, { detail: "pin_limit", limit: 5 }),
        );
        await expect(client.savePin("c1", { label: "x", emoji: "" })).resolves.toBe("You can pin up to 5 chats.");
    });

    it("reorders with the whole order and adopts the response", async () => {
        const { client, internals } = makeClient();
        internals.state = { ...internals.state, journalPins: [pin("a", 0), pin("b", 1)] };
        internals.api!.reorderPins.mockResolvedValue({ pins: [rawPin("b", 0), rawPin("a", 1)], limit: 5 });
        await client.shiftPin("b", "up");
        expect(internals.api!.reorderPins).toHaveBeenCalledWith(["b", "a"]);
        expect(client.getSnapshot().journalPins?.map((entry) => entry.convo_id)).toEqual(["b", "a"]);
    });
});
