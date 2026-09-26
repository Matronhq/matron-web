/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatronJournalClient } from "../client";
import type { ClientState } from "../types";
import { TrackerPane } from "../tracker/TrackerPane";
import { trackerItem } from "./tracker-fixtures";

interface FakeClient {
    loadInbox: jest.Mock;
    loadItem: jest.Mock;
    closeTrackerView: jest.Mock;
    openTrackerView: jest.Mock;
    openTrackerItem: jest.Mock;
    getSnapshot: jest.Mock;
}

function fakeClient(): FakeClient {
    return {
        loadInbox: jest.fn().mockResolvedValue(undefined),
        loadItem: jest.fn().mockResolvedValue(undefined),
        closeTrackerView: jest.fn(),
        openTrackerView: jest.fn(),
        openTrackerItem: jest.fn(),
        getSnapshot: jest.fn().mockReturnValue({ selectedConversationId: "c1", conversations: [] }),
    };
}

function paneState(over: Partial<ClientState>): ClientState {
    return over as unknown as ClientState;
}

async function mount(element: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
    const container = document.createElement("div");
    document.body.append(container);
    let root!: Root;
    await act(async () => {
        root = createRoot(container);
        root.render(element);
    });
    return { container, root };
}

describe("TrackerPane selection/detail matching (F1)", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    it("does NOT render a cached item detail whose num differs from the current selection", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                // Selection moved to #9 but the store still holds #7's detail (mid-load). The stale
                // record must not drive ItemDetail — its reply/close handlers would target #7.
                state={paneState({
                    trackerView: { open: true, view: "inbox", selectedItemId: 9 },
                    trackerItem: { item: trackerItem({ num: 7 }), comments: [] },
                    inboxItems: [],
                })}
            />,
        );

        expect(container.querySelector(".mj_TrackerComposer")).toBeNull();
        expect(container.querySelector(".mj_TrackerInboxToggle")).not.toBeNull();
    });

    it("renders the item detail once the cached record matches the current selection", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({
                    trackerView: { open: true, view: "inbox", selectedItemId: 7 },
                    trackerItem: { item: trackerItem({ num: 7 }), comments: [] },
                })}
            />,
        );

        expect(container.querySelector(".mj_TrackerComposer")).not.toBeNull();
    });
});

describe("TrackerPane inbox", () => {
    beforeAll(() => {
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });

    // Before the first load lands, an empty list would read as a false "Nothing needs you".
    it("shows a loading status, not an empty inbox, before the first inbox load lands", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({ trackerView: { open: true, view: "inbox" }, trackerLoading: true })}
            />,
        );

        expect(container.querySelector(".mj_TrackerPane_body [role=status]")?.textContent).toBe("Loading…");
        expect(container.textContent).not.toContain("Nothing needs you");
    });

    it("says the inbox failed and offers a retry when its first load fails", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({ trackerView: { open: true, view: "inbox" }, inboxError: "offline" })}
            />,
        );

        const status = container.querySelector(".mj_TrackerPane_body [role=status]");
        expect(status?.textContent).toContain("Couldn't load the inbox");
        expect(container.textContent).not.toContain("Nothing needs you");

        client.loadInbox.mockClear();
        await act(async () => {
            status!.querySelector<HTMLButtonElement>("button")!.click();
        });
        expect(client.loadInbox).toHaveBeenCalledTimes(1);
    });

    // The shared banner error can come from (and be cleared by) an item load; it must not stand in
    // for the inbox's own state.
    it("keeps showing loading when only another tracker load has failed", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({ trackerView: { open: true, view: "inbox" }, trackerError: "item gone" })}
            />,
        );

        expect(container.querySelector("[role=alert]")?.textContent).toBe("item gone");
        expect(container.querySelector(".mj_TrackerPane_body [role=status]")?.textContent).toBe("Loading…");
    });

    it("shows the empty inbox once a load has landed with no items", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({ trackerView: { open: true, view: "inbox" }, inboxItems: [] })}
            />,
        );

        expect(container.textContent).toContain("Nothing needs you");
    });

    it("goes back to the inbox by clearing the selection in one view update", async () => {
        const client = fakeClient();
        const { container } = await mount(
            <TrackerPane
                client={client as unknown as MatronJournalClient}
                state={paneState({
                    trackerView: { open: true, view: "inbox", selectedItemId: 7 },
                    trackerItem: { item: trackerItem({ num: 7 }), comments: [] },
                    inboxItems: [],
                })}
            />,
        );

        await act(async () => {
            container.querySelector<HTMLButtonElement>(".mj_TrackerBack")!.click();
        });
        expect(client.openTrackerView).toHaveBeenCalledWith({ view: "inbox", itemId: null });
        expect(client.closeTrackerView).not.toHaveBeenCalled();
    });

    it("follows a conversation rename without remounting", async () => {
        const client = fakeClient();
        client.getSnapshot.mockReturnValue({
            selectedConversationId: "c-here",
            conversations: [{ id: "c-listed", title: "Listed chat" }],
        });
        const state = paneState({
            trackerView: { open: true, view: "inbox" },
            inboxItems: [trackerItem({ id: "it_b", num: 2, origin_convo_id: "c-listed" })],
        });
        const { container, root } = await mount(
            <TrackerPane client={client as unknown as MatronJournalClient} state={state} />,
        );
        expect(container.querySelector(".mj_TrackerItemRow_origin")?.textContent).toBe("Listed chat");

        // The client replaces its conversation list on a rename and re-renders the pane.
        client.getSnapshot.mockReturnValue({
            selectedConversationId: "c-here",
            conversations: [{ id: "c-listed", title: "Renamed chat" }],
        });
        await act(async () => {
            root.render(<TrackerPane client={client as unknown as MatronJournalClient} state={{ ...state }} />);
        });
        expect(container.querySelector(".mj_TrackerItemRow_origin")?.textContent).toBe("Renamed chat");
    });
});
