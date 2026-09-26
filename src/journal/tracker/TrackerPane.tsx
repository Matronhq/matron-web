/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The Tracker pane — the main-region surface (Phase 3 renders it alongside the Files pane and the
 * conversation view, one at a time). A header with a Missions/Inbox segmented switch and a close
 * button; the body follows the store's selection precedence: an open item detail wins, then an open
 * mission detail, then the list for the active view. Loads are issued from effects and the data is
 * store-resident, so WS invalidation keeps every surface live. Presentational composition only —
 * all fetching + mutation lives on the client.
 */

import React, { useEffect } from "react";

import type { MatronJournalClient } from "../client";
import { CloseIcon } from "../icons";
import type { ClientState } from "../types";
import { ItemDetail } from "./ItemDetail";
import { ItemsInbox } from "./ItemsInbox";
import { MissionDetail } from "./MissionDetail";
import { MissionsList } from "./MissionsList";

export function TrackerPane({
    client,
    state,
}: {
    client: MatronJournalClient;
    state: ClientState;
}): React.ReactElement {
    const view = state.trackerView?.view ?? "inbox";
    const selectedItemId = state.trackerView?.selectedItemId;
    const selectedMissionId = state.trackerView?.selectedMissionId;

    // Opening the pane primes both list views so the sidebar badges + either tab are ready.
    useEffect(() => {
        void client.loadMissions();
        void client.loadInbox();
    }, [client]);

    useEffect(() => {
        if (selectedItemId != null) void client.loadItem(selectedItemId);
    }, [client, selectedItemId]);

    useEffect(() => {
        if (selectedMissionId != null) void client.loadMission(selectedMissionId);
    }, [client, selectedMissionId]);

    // The view switch (and the detail back buttons) clear any open detail selection; null clears a
    // selected id explicitly, in one view update.
    const switchView = (next: "missions" | "inbox"): void =>
        client.openTrackerView({ view: next, itemId: null, missionId: null });

    // Did the last load of the selected item fail? The error is keyed to the item, so a failure
    // for an earlier selection never shows against this one.
    const selectedItemLoadFailed = selectedItemId != null && state.itemLoadError?.id === String(selectedItemId);
    const retryItem = (): void => {
        if (selectedItemId != null) void client.loadItem(selectedItemId);
    };

    const body = ((): React.ReactElement => {
        // Render a cached detail ONLY when it belongs to the current selection. A detail loaded for
        // a previously selected row is cleared to null on selection change (openTracker*), but the
        // id/num match here is the belt-and-braces guard so a stale record can never drive the detail
        // (whose action handlers close/reopen by that record's num) against the new selection (F1).
        if (
            view === "inbox" &&
            selectedItemId != null &&
            state.trackerItem &&
            state.trackerItem.item.num === selectedItemId
        ) {
            // A failed refresh keeps the loaded record (loaders never clear data on failure), but
            // says it may be out of date and offers a retry, which a later load's banner reset
            // would otherwise take away.
            return (
                <>
                    {selectedItemLoadFailed ? (
                        <div className="mj_TrackerStaleNotice" role="status">
                            Couldn't refresh this item, so it may be out of date.{" "}
                            <button type="button" className="mj_TrackerTextButton" onClick={retryItem}>
                                Try again
                            </button>
                        </div>
                    ) : null}
                    <ItemDetail
                        item={state.trackerItem.item}
                        comments={state.trackerItem.comments}
                        client={client}
                        onBack={() => switchView("inbox")}
                    />
                </>
            );
        }
        // The selected item's load failed with nothing loaded to show. Re-tapping its inbox row
        // would not reload it (the selection doesn't change), so say so here and offer a retry.
        if (view === "inbox" && selectedItemLoadFailed) {
            return (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Couldn't load this item</p>
                    <button type="button" className="mj_TrackerTextButton" onClick={retryItem}>
                        Try again
                    </button>
                    <button type="button" className="mj_TrackerTextButton" onClick={() => switchView("inbox")}>
                        Back to inbox
                    </button>
                </div>
            );
        }
        if (
            view === "missions" &&
            selectedMissionId != null &&
            state.trackerMission &&
            state.trackerMission.mission?.num === selectedMissionId
        ) {
            return (
                <MissionDetail
                    detail={state.trackerMission}
                    client={client}
                    onOpenItem={(num) => client.openTrackerItem(num)}
                    onBack={() => switchView("missions")}
                />
            );
        }
        // Until a list's first load lands there is nothing to reason over: an empty list would read
        // as a false "No missions yet" / "Nothing needs you". A failed load says so and offers a retry;
        // each list has its own error for this, since any other tracker load clears the shared banner.
        const list =
            view === "missions"
                ? {
                      loaded: state.missions,
                      error: state.missionsError,
                      noun: "missions",
                      reload: () => client.loadMissions(),
                  }
                : {
                      loaded: state.inboxItems,
                      error: state.inboxError,
                      noun: "the inbox",
                      reload: () => client.loadInbox(),
                  };
        if (list.loaded === undefined) {
            return list.error ? (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Couldn't load {list.noun}</p>
                    <button type="button" className="mj_TrackerTextButton" onClick={() => void list.reload()}>
                        Try again
                    </button>
                </div>
            ) : (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Loading…</p>
                </div>
            );
        }
        if (view === "missions") {
            return (
                <MissionsList missions={state.missions ?? []} onOpenMission={(num) => client.openTrackerMission(num)} />
            );
        }
        return (
            <ItemsInbox
                items={state.inboxItems ?? []}
                client={client}
                onOpenItem={(num) => client.openTrackerItem(num)}
            />
        );
    })();

    return (
        <div className="mj_TrackerPane">
            <div className="mj_TrackerPane_top">
                <button
                    type="button"
                    className="mj_IconButton mj_TrackerPane_close"
                    aria-label="Close tracker"
                    onClick={() => client.closeTrackerView()}
                >
                    <CloseIcon />
                </button>
                <h1 className="mj_TrackerPane_title">Tracker</h1>
                <div className="mj_TrackerViewSwitch" role="tablist" aria-label="Tracker view">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === "missions"}
                        className={`mj_TrackerViewSwitch_tab${view === "missions" ? " mj_TrackerViewSwitch_tab_active" : ""}`}
                        onClick={() => switchView("missions")}
                    >
                        Missions
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={view === "inbox"}
                        className={`mj_TrackerViewSwitch_tab${view === "inbox" ? " mj_TrackerViewSwitch_tab_active" : ""}`}
                        onClick={() => switchView("inbox")}
                    >
                        Inbox
                    </button>
                </div>
                {state.trackerLoading ? <span className="mj_TrackerPane_spinner" aria-label="Loading" /> : null}
            </div>

            {state.trackerError ? (
                <div className="mj_TrackerErrorBanner" role="alert">
                    {state.trackerError}
                </div>
            ) : null}

            <div className="mj_TrackerPane_body">{body}</div>
        </div>
    );
}
