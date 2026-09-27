/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The Tracker pane — the main-region surface (rendered alongside the conversation view, one at a
 * time). A header with a close button; the body follows the store's selection: an open item detail
 * wins, otherwise the Decisions/Items inbox. Loads are issued from effects and the data is
 * store-resident, so WS invalidation keeps every surface live. Presentational composition only —
 * all fetching + mutation lives on the client.
 */

import React, { useEffect } from "react";

import type { MatronJournalClient } from "../client";
import { CloseIcon } from "../icons";
import type { ClientState } from "../types";
import { ItemDetail } from "./ItemDetail";
import { ItemsInbox } from "./ItemsInbox";

export function TrackerPane({
    client,
    state,
}: {
    client: MatronJournalClient;
    state: ClientState;
}): React.ReactElement {
    const selectedItemId = state.trackerView?.selectedItemId;

    // Opening the pane primes the inbox so the sidebar badge + list are ready.
    useEffect(() => {
        void client.loadInbox();
    }, [client]);

    useEffect(() => {
        if (selectedItemId != null) void client.loadItem(selectedItemId);
    }, [client, selectedItemId]);

    // The detail back button clears the open item selection (itemId: null clears it explicitly).
    const backToInbox = (): void => client.openTrackerView({ view: "inbox", itemId: null });

    // Did the last load of the selected item fail? The error is keyed to the item, so a failure
    // for an earlier selection never shows against this one.
    const selectedItemLoadFailed = selectedItemId != null && state.itemLoadError?.id === String(selectedItemId);
    const retryItem = (): void => {
        if (selectedItemId != null) void client.loadItem(selectedItemId);
    };

    const body = ((): React.ReactElement => {
        // Render a cached detail ONLY when it belongs to the current selection. A detail loaded for
        // a previously selected row is cleared to null on selection change (openTrackerItem), but the
        // num match here is the belt-and-braces guard so a stale record can never drive the detail
        // (whose action handlers close/reopen by that record's num) against the new selection (F1).
        if (selectedItemId != null && state.trackerItem && state.trackerItem.item.num === selectedItemId) {
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
                        onBack={backToInbox}
                    />
                </>
            );
        }
        // The selected item's load failed with nothing loaded to show. Re-tapping its inbox row
        // would not reload it (the selection doesn't change), so say so here and offer a retry.
        if (selectedItemLoadFailed) {
            return (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Couldn't load this item</p>
                    <button type="button" className="mj_TrackerTextButton" onClick={retryItem}>
                        Try again
                    </button>
                    <button type="button" className="mj_TrackerTextButton" onClick={backToInbox}>
                        Back to inbox
                    </button>
                </div>
            );
        }
        // Until the first inbox load lands there is no list to reason over: an empty one would read
        // as a false "Nothing needs you". A failed load says so and offers a retry; the inbox has its
        // own error for this, since any other tracker load clears the shared banner.
        if (state.inboxItems === undefined) {
            return state.inboxError ? (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Couldn't load the inbox</p>
                    <button type="button" className="mj_TrackerTextButton" onClick={() => void client.loadInbox()}>
                        Try again
                    </button>
                </div>
            ) : (
                <div className="mj_TrackerEmpty" role="status">
                    <p className="mj_TrackerEmpty_title">Loading…</p>
                </div>
            );
        }
        return (
            <ItemsInbox items={state.inboxItems} client={client} onOpenItem={(num) => client.openTrackerItem(num)} />
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
