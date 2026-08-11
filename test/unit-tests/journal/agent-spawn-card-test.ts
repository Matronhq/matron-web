/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    archiveStore,
    favoriteStore,
    MatronJournalClient,
    pinnedStore,
    unreadStore,
} from "../../../src/journal/client";
import { MatronApp } from "../../../src/journal/components";
import { eventSnippet } from "../../../src/journal/types";
import type { ClientState, Conversation, JournalEvent, Session } from "../../../src/journal/types";

jest.mock("../../../res/matron-logo-simple.svg", () => "matron-logo.svg");

const CONVERSATION: Conversation = {
    id: "c1",
    title: "One",
    session_state: "running",
    last_seq: 1,
    unread_count: 0,
    snippet: "",
    created_at: 1,
    read_up_to_seq: 0,
};

const SESSION: Session = {
    serverUrl: "https://journal.example",
    token: "t",
    deviceId: 1,
    userId: 2,
    username: "dan",
};

interface ClientInternals {
    state: ClientState;
    database?: unknown;
}

function internals(client: MatronJournalClient): ClientInternals {
    return client as unknown as ClientInternals;
}

function signedInClient(options: { events?: JournalEvent[] } = {}): MatronJournalClient {
    const client = new MatronJournalClient();
    internals(client).state = {
        ...client.getSnapshot(),
        phase: "signed-in",
        session: SESSION,
        conversations: [CONVERSATION],
        selectedConversationId: CONVERSATION.id,
        events: options.events ?? [],
        pendingMessages: [],
        connection: "online",
        archivedIds: archiveStore.read(SESSION).ids,
        pinnedIds: pinnedStore.read(SESSION).ids,
        favoriteIds: favoriteStore.read(SESSION).ids,
        unreadOverrideIds: unreadStore.read(SESSION).ids,
    };
    return client;
}

async function renderClient(client: MatronJournalClient): Promise<{ container: HTMLDivElement; root: Root }> {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(React.createElement(MatronApp, { client }));
    });
    return { container, root };
}

const spawnCardEvent = (over: Record<string, unknown> = {}): JournalEvent => ({
    seq: 40,
    convo_id: "c1",
    ts: 1700000000,
    sender: "agent:dev-6",
    type: "permission_request",
    payload: {
        kind: "agent_spawn",
        request_id: "spawn-1",
        from_device_id: 7,
        from_name: "dev-6",
        from_convo_id: "c1",
        from_convo_title: "Fix the flaky tests",
        target_device_id: 12,
        target_name: "eric",
        workdir: "/home/dan/proj",
        task: "Run the suite and fix flakes",
        topic: "Flake hunt",
        ...over,
    },
});

const spawnOutcomeEvent = (outcome: string, extra: Record<string, unknown> = {}, seq = 41): JournalEvent => ({
    seq,
    convo_id: "c1",
    ts: 1700000100,
    sender: "journal",
    type: "spawn_outcome",
    payload: { request_id: "spawn-1", outcome, ...extra },
});

describe("agent_spawn card dispatch", () => {
    let rendered: { container: HTMLDivElement; root: Root } | undefined;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        if (rendered) {
            await act(async () => rendered?.root.unmount());
            rendered.container.remove();
            rendered = undefined;
        }
    });

    it("renders the spawn card with headline, detail rows, task, and actions", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnCardEvent()] }));

        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card).not.toBeNull();
        expect(card?.querySelector(".mj_PromptCard_permission")).toBeNull();
        expect(card?.querySelector(".mj_SpawnHeadline")?.textContent).toBe("Flake hunt");
        expect(card?.querySelector(".mj_SpawnDetail_target .mj_SpawnDetail_value")?.textContent).toBe("eric");
        expect(card?.querySelector(".mj_SpawnDetail_folder .mj_SpawnDetail_value")?.textContent).toBe("/home/dan/proj");
        expect(card?.querySelector(".mj_SpawnDetail_from .mj_SpawnDetail_value")?.textContent).toContain(
            "Fix the flaky tests",
        );
        expect(card?.querySelector(".mj_SpawnDetail_from .mj_SpawnDetail_value")?.textContent).toContain("dev-6");
        expect(card?.querySelector(".mj_SpawnTask")?.textContent).toBe("Run the suite and fix flakes");
        expect([...(card?.querySelectorAll("button") ?? [])].map((button) => button.textContent)).toEqual([
            "Deny",
            "Approve",
        ]);
    });

    it("falls back to the first line of the task when topic is absent", async () => {
        rendered = await renderClient(
            signedInClient({ events: [spawnCardEvent({ topic: undefined, task: "Line one\nLine two" })] }),
        );

        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_SpawnHeadline")?.textContent).toBe("Line one");
        expect(card?.querySelector(".mj_SpawnTask")?.textContent).toBe("Line one\nLine two");
    });

    it("falls back to the generic permission card when request_id is missing", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnCardEvent({ request_id: undefined })] }));

        expect(rendered.container.querySelector(".mj_PromptCard_spawn")).toBeNull();
        expect(rendered.container.querySelector(".mj_PromptCard_permission")).not.toBeNull();
    });

    it("falls back to the generic permission card when task is empty", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnCardEvent({ task: "" })] }));

        expect(rendered.container.querySelector(".mj_PromptCard_spawn")).toBeNull();
        expect(rendered.container.querySelector(".mj_PromptCard_permission")).not.toBeNull();
    });
});

describe("agent_spawn card resolved states", () => {
    let rendered: { container: HTMLDivElement; root: Root } | undefined;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        if (rendered) {
            await act(async () => rendered?.root.unmount());
            rendered.container.remove();
            rendered = undefined;
        }
    });

    it("shows Started and an Open button, with no action buttons, once a started outcome arrives", async () => {
        rendered = await renderClient(
            signedInClient({
                events: [spawnCardEvent(), spawnOutcomeEvent("started", { room_id: "r1", child_convo_id: "cc1" })],
            }),
        );

        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_Answered")?.textContent).toBe("Started");
        expect(card?.querySelector(".mj_SpawnOpenButton")).not.toBeNull();
        expect(
            [...(card?.querySelectorAll(".mj_PromptOptions button") ?? [])].map((button) => button.textContent),
        ).toEqual([]);
    });

    it("shows Denied for a declined outcome", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnCardEvent(), spawnOutcomeEvent("declined")] }));
        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_Answered")?.textContent).toBe("Denied");
        expect(card?.querySelector(".mj_SpawnOpenButton")).toBeNull();
    });

    it("shows Expired for an expired outcome", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnCardEvent(), spawnOutcomeEvent("expired")] }));
        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_Answered")?.textContent).toBe("Expired");
    });

    it("shows Failed with the error code for a failed outcome", async () => {
        rendered = await renderClient(
            signedInClient({ events: [spawnCardEvent(), spawnOutcomeEvent("failed", { error_code: "boom" })] }),
        );
        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_Answered")?.textContent).toBe("Failed — boom");
    });

    it("never crashes on an unknown outcome value and shows neutral copy", async () => {
        rendered = await renderClient(
            signedInClient({ events: [spawnCardEvent(), spawnOutcomeEvent("something-new")] }),
        );
        const card = rendered.container.querySelector(".mj_PromptCard_spawn");
        expect(card?.querySelector(".mj_Answered")?.textContent).toBe("Spawn request resolved");
    });
});

describe("spawn_outcome standalone row", () => {
    let rendered: { container: HTMLDivElement; root: Root } | undefined;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    afterEach(async () => {
        if (rendered) {
            await act(async () => rendered?.root.unmount());
            rendered.container.remove();
            rendered = undefined;
        }
    });

    it.each([
        ["started", {}, "🚀 Spawned session started"],
        ["declined", {}, "🚫 Spawn declined"],
        ["expired", {}, "⌛ Spawn request expired"],
        ["failed", { error_code: "boom" }, "❌ Spawn failed — boom"],
        ["something-new", {}, "Spawn request resolved"],
    ])("renders the %s status line without a card present", async (outcome, extra, expected) => {
        rendered = await renderClient(
            signedInClient({ events: [spawnOutcomeEvent(outcome, extra as Record<string, unknown>)] }),
        );
        const row = rendered.container.querySelector(".mj_SpawnOutcomeRow");
        expect(row).not.toBeNull();
        expect(row?.textContent).toBe(expected);
    });

    it("shows an Open button only for the started outcome", async () => {
        rendered = await renderClient(
            signedInClient({ events: [spawnOutcomeEvent("started", { room_id: "r1", child_convo_id: "cc1" })] }),
        );
        expect(rendered.container.querySelector(".mj_SpawnOutcomeRow .mj_SpawnOpenButton")).not.toBeNull();

        await act(async () => rendered?.root.unmount());
        rendered.container.remove();

        rendered = await renderClient(signedInClient({ events: [spawnOutcomeEvent("declined")] }));
        expect(rendered.container.querySelector(".mj_SpawnOutcomeRow .mj_SpawnOpenButton")).toBeNull();
    });

    it("does not render a raw JSON dump for spawn_outcome events", async () => {
        rendered = await renderClient(signedInClient({ events: [spawnOutcomeEvent("started", { room_id: "r1" })] }));
        expect(rendered.container.querySelector(".mj_Unknown")).toBeNull();
    });
});

describe("eventSnippet for spawn_outcome", () => {
    it.each([
        ["started", {}, "🚀 Spawned session started"],
        ["declined", {}, "🚫 Spawn declined"],
        ["expired", {}, "⌛ Spawn request expired"],
        ["failed", { error_code: "boom" }, "❌ Spawn failed — boom"],
        ["something-new", {}, "Spawn request resolved"],
    ])("maps outcome %s to its snippet", (outcome, extra, expected) => {
        expect(eventSnippet("spawn_outcome", { request_id: "spawn-1", outcome, ...extra })).toBe(expected);
    });
});
