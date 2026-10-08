/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TextEncoder as NodeTextEncoder } from "node:util";

import { favoriteStore, MatronJournalClient, pinnedStore, unreadStore } from "../client";
import { MatronApp } from "../components";
import type { ClientState, Conversation, Session } from "../types";

jest.mock("../../../res/matron-logo-simple.svg", () => "matron-logo.svg");

const SESSION: Session = {
    serverUrl: "https://journal.example",
    token: "t",
    deviceId: 1,
    userId: 2,
    username: "alice",
};
const CONVERSATION: Conversation = {
    id: "c1",
    title: "One",
    session_state: "running",
    last_seq: 1,
    unread_count: 0,
    snippet: "",
    created_at: 1,
    read_up_to_seq: 1,
};

function signedInClient(): MatronJournalClient {
    const client = new MatronJournalClient();
    (client as unknown as { state: ClientState }).state = {
        ...client.getSnapshot(),
        phase: "signed-in",
        session: SESSION,
        conversations: [CONVERSATION],
        selectedConversationId: "c1",
        events: [],
        pendingMessages: [],
        connection: "online",
        archivedIds: new Set(),
        pinnedIds: pinnedStore.read(SESSION).ids,
        favoriteIds: favoriteStore.read(SESSION).ids,
        unreadOverrideIds: unreadStore.read(SESSION).ids,
    };
    return client;
}

function type(textarea: HTMLTextAreaElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("composer shell (Mac layout)", () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        Object.defineProperty(globalThis, "TextEncoder", { value: NodeTextEncoder, configurable: true });
    });

    beforeEach(() => {
        localStorage.clear();
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
        container.remove();
        jest.restoreAllMocks();
    });

    async function render(client: MatronJournalClient): Promise<void> {
        await act(async () => root.render(<MatronApp client={client} />));
    }

    const textarea = (): HTMLTextAreaElement => container.querySelector<HTMLTextAreaElement>("textarea")!;
    const sendButton = (): HTMLButtonElement | null =>
        container.querySelector<HTMLButtonElement>('button[aria-label="Send message"]');

    it("has no hint row and uses the Mac placeholder", async () => {
        await render(signedInClient());
        expect(container.querySelector(".mj_ComposerHint")).toBeNull();
        expect(textarea().placeholder).toBe("Message…");
        // The instructions stay for assistive tech as a visually hidden description.
        const hint = document.getElementById(textarea().getAttribute("aria-describedby")!);
        expect(hint?.classList.contains("mj_ScreenReaderOnly")).toBe(true);
        expect(hint?.textContent).toContain("/ commands · shift+enter for newline");
    });

    it("shows the send glyph only while there is text", async () => {
        await render(signedInClient());
        expect(sendButton()).toBeNull();
        await act(async () => type(textarea(), "hi"));
        expect(sendButton()).not.toBeNull();
        expect(sendButton()!.classList.contains("mj_ComposerSend")).toBe(true);
        await act(async () => type(textarea(), "   "));
        expect(sendButton()).toBeNull();
    });

    it("keeps attach and mic outside the field, as siblings of it", async () => {
        await render(signedInClient());
        const row = container.querySelector(".mj_ComposerRow")!;
        const children = [...row.children];
        const field = container.querySelector(".mj_ComposerField")!;
        const attach = container.querySelector('button[aria-label="Attach a file"]')!;
        const mic = container.querySelector('button[aria-label="Record voice message"]')!;
        expect(children.indexOf(attach)).toBeGreaterThanOrEqual(0);
        expect(children.indexOf(attach)).toBeLessThan(children.indexOf(field));
        expect(children.indexOf(mic)).toBeGreaterThan(children.indexOf(field));
        expect(field.contains(attach)).toBe(false);
        expect(field.contains(mic)).toBe(false);
    });

    it("returns focus to the textarea after sending with the button (the button unmounts)", async () => {
        const client = signedInClient();
        jest.spyOn(client, "sendMessage").mockResolvedValue(true);
        await render(client);
        await act(async () => type(textarea(), "hi"));
        sendButton()!.focus();
        await act(async () => {
            sendButton()!.click();
        });
        expect(sendButton()).toBeNull();
        expect(document.activeElement).toBe(textarea());
    });

    it("sends on Enter with text and does nothing on Enter when empty", async () => {
        const client = signedInClient();
        const send = jest.spyOn(client, "sendMessage").mockResolvedValue(true);
        await render(client);
        const enter = () =>
            textarea().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await act(async () => {
            enter();
        });
        expect(send).not.toHaveBeenCalled();
        await act(async () => type(textarea(), "ship it"));
        await act(async () => {
            enter();
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toBe("ship it");
    });
});
