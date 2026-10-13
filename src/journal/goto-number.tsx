// "Go to number": jump to a tracker item, mission, milestone or project by its number. The four
// kinds share one per-user number space, so the journal is asked which kind a number names
// (client.lookupNumber) before anything opens. The same lookup puts an exact match at the top of
// the sidebar search when the query is just a number.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { MatronJournalClient } from "./client";
import { SheetHead, useSheetLifecycle } from "./PinDialogs";
import type { NumberLookup, NumberLookupKind } from "./types";

/** Keystrokes settle for this long before the search box asks the journal about a number. */
export const NUMBER_SEARCH_DEBOUNCE_MS = 200;

/** "412", "#412" or " # 412 " → 412; anything that is not just a positive number → null. */
export function parseTrackerNumber(text: string): number | null {
    const match = /^#?\s*([0-9]{1,15})$/.exec(text.trim());
    if (!match) return null;
    const num = Number(match[1]);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
}

const KIND_LABEL: Record<NumberLookupKind, string> = {
    item: "Item",
    mission: "Mission",
    milestone: "Milestone",
    project: "Project",
};

/** True for the shortcut that opens the field: ⌘J on a Mac, Ctrl+J elsewhere. */
export function isGoToNumberShortcut(
    event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
    mac: boolean,
): boolean {
    if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "j") return false;
    return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

const isMac = (): boolean => /Mac|iPhone|iPad/.test(navigator.platform);

/** The shortcut's name for a button tooltip. */
export const goToNumberShortcutLabel = (): string => (isMac() ? "⌘J" : "Ctrl+J");

/** Binds the shortcut for as long as the host is mounted; `enabled` false leaves the key alone. */
export function useGoToNumberShortcut(client: MatronJournalClient, enabled: boolean): void {
    useEffect(() => {
        if (!enabled) return undefined;
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.defaultPrevented || !isGoToNumberShortcut(event, isMac())) return;
            event.preventDefault();
            client.openGoToNumber();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [client, enabled]);
}

export function GoToNumberDialog({ client }: { client: MatronJournalClient }): React.ReactElement {
    const onClose = (): void => client.closeGoToNumber();
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string>();
    const mountedRef = useSheetLifecycle(onClose);

    const go = async (): Promise<void> => {
        if (busy) return;
        const num = parseTrackerNumber(text);
        if (num === null) {
            setMessage("Enter a number, like 412.");
            return;
        }
        setBusy(true);
        setMessage(undefined);
        const outcome = await client.lookupNumber(num);
        if (!mountedRef.current) return;
        setBusy(false);
        if (outcome.status === "none") setMessage(`No #${num}`);
        else if (outcome.status === "failed") setMessage(`Couldn't look up #${num}. Try again in a moment.`);
        else if (client.openNumberHit(outcome.hit, num)) onClose();
        else setMessage(`#${num} is a milestone, and its mission can't be opened here.`);
    };

    return createPortal(
        <div className="mj_UploadConfirm_scrim" role="dialog" aria-modal="true" aria-labelledby="mj-goto-title">
            <form
                className="mj_UploadConfirm mj_NewSessionSheet mj_GoToSheet"
                onSubmit={(event) => {
                    event.preventDefault();
                    void go();
                }}
            >
                <SheetHead id="mj-goto-title" title="Go to number" onClose={onClose} />
                <div>
                    <label htmlFor="mj-goto-number">Item, mission or project number</label>
                    <input
                        id="mj-goto-number"
                        type="text"
                        inputMode="numeric"
                        value={text}
                        maxLength={17}
                        autoFocus
                        autoComplete="off"
                        placeholder="#"
                        aria-describedby={message ? "mj-goto-message" : undefined}
                        onChange={(event) => {
                            setText(event.target.value);
                            setMessage(undefined);
                        }}
                    />
                </div>
                {message && (
                    <p className="mj_UploadConfirm_error" id="mj-goto-message" role="alert">
                        {message}
                    </p>
                )}
                <div className="mj_UploadConfirm_actions">
                    <button type="button" onClick={onClose}>
                        Cancel
                    </button>
                    <button type="submit" className="mj_UploadConfirm_send" disabled={busy || !text.trim()}>
                        Go
                    </button>
                </div>
            </form>
        </div>,
        document.body,
    );
}

/**
 * The exact match for a search that is just a number: one row, above the chat list, opening the
 * item, mission or project that carries it. Rows that merely mention the number still come from
 * the title filter and the message search below. Nothing renders for any other query, for a
 * number nothing carries, or when the journal cannot be asked.
 */
export function NumberSearchResult({
    client,
    query,
}: {
    client: MatronJournalClient;
    query: string;
}): React.ReactElement | null {
    const num = parseTrackerNumber(query);
    const [found, setFound] = useState<{ num: number; hit: NumberLookup }>();

    useEffect(() => {
        if (num === null) return undefined;
        const controller = new AbortController();
        let current = true;
        const timer = setTimeout(() => {
            void client.lookupNumber(num, controller.signal).then((outcome) => {
                if (current) setFound(outcome.status === "found" ? { num, hit: outcome.hit } : undefined);
            });
        }, NUMBER_SEARCH_DEBOUNCE_MS);
        return () => {
            current = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [client, num]);

    // `found` can lag the box by a debounce or an in-flight lookup: only show it for the number
    // the box holds now. A milestone whose mission is unknown has nowhere to go.
    if (num === null || !found || found.num !== num) return null;
    const { hit } = found;
    if (hit.kind === "milestone" && !hit.mission) return null;
    const label = `${KIND_LABEL[hit.kind]} #${hit.num ?? num}`;
    return (
        <div className="mj_SearchResults mj_NumberSearchResult" data-testid="number-search-result">
            <div className="mj_SearchResults_heading" role="presentation">
                Go to
            </div>
            <button
                type="button"
                className="mj_SearchHit"
                aria-label={`Go to ${label}${hit.title ? `: ${hit.title}` : ""}`}
                onClick={() => client.openNumberHit(hit, num)}
            >
                <span className="mj_SearchHit_top">
                    <span className="mj_SearchHit_title">{label}</span>
                </span>
                {hit.title ? <span className="mj_SearchHit_snippet">{hit.title}</span> : null}
            </button>
        </div>
    );
}
