/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * A full-width inbox row for one tracker item. Leading kind glyph, the title on its own line, then
 * a meta line that LEADS with the #number (monospaced-digit) and carries one status token. The
 * whole row is a button → onOpen(num). Presentational: it derives everything from the item plus a
 * caller-resolved origin title; no data fetching.
 *
 * A notice (something to read, not to decide) is drawn lighter than a question: regular-weight
 * secondary title, a muted "To read" token instead of the orange "Needs you", no orange edge. Given
 * `onSeen`, an open notice carries a one-tap Seen button beside the row (a sibling, not nested in
 * the row's button).
 */

import React from "react";

import type { TrackerItem } from "../types";
import {
    awaitsSeen,
    isFromViewedConvo,
    itemStatusText,
    kindLabel,
    needsUser,
    oneLine,
    resolutionLabel,
} from "./format";
import { CommentBubbleGlyph, ImagePlaceholderGlyph, MissionGlyph, TrackerGlyph } from "./glyphs";
import { inlineRefsToText } from "./inline-attachments";

export function ItemRow({
    item,
    scope = "chat",
    originTitle,
    currentConvoId,
    onOpen,
    onSeen,
    seenBusy = false,
}: {
    item: TrackerItem;
    scope?: "chat" | "all";
    originTitle?: string;
    /** The conversation being viewed. A row filed from it carries no origin note (it is "this
     *  session"); a row from any other conversation reads "from <title>". */
    currentConvoId?: string | null;
    onOpen: (num: number) => void;
    /** Marks an open notice seen; without it no Seen button is drawn. */
    onSeen?: (num: number) => void;
    /** The Seen tap is in flight: the button is disabled. */
    seenBusy?: boolean;
}): React.ReactElement {
    const notice = item.kind === "notice";
    // A notice awaiting the user is still in "Needs you", but it is not the urgent orange state.
    const urgent = needsUser(item) && !notice;
    const showSeen = !!onSeen && awaitsSeen(item);
    const origin = scope === "all" && originTitle && !isFromViewedConvo(item, currentConvoId) ? originTitle : null;
    // The preview shows no attachments, so an inline image ref reads as its caption.
    const body = oneLine(inlineRefsToText(item.body));
    // ONE status token: needs-you (orange) → closed-with-resolution → with-the-agent. An open item
    // awaiting nobody-in-particular shows no token (the row itself is the "open" signal).
    const statusToken = urgent ? (
        <span className="mj_TrackerItemRow_status mj_TrackerItemRow_status_needsyou">Needs you</span>
    ) : notice && needsUser(item) ? (
        <span className="mj_TrackerItemRow_status mj_TrackerItemRow_status_muted">To read</span>
    ) : item.state === "closed" ? (
        <span className="mj_TrackerItemRow_status mj_TrackerItemRow_status_muted">
            {item.resolution ? resolutionLabel(item.resolution) : "Closed"}
        </span>
    ) : item.awaiting === "agent" ? (
        <span className="mj_TrackerItemRow_status mj_TrackerItemRow_status_muted">With the agent</span>
    ) : null;

    const label = [
        kindLabel(item.kind),
        `number ${item.num}`,
        item.title,
        origin ? `from ${origin}` : "",
        itemStatusText(item),
    ]
        .filter(Boolean)
        .join(", ");

    const row = (
        <button
            type="button"
            className={`mj_TrackerItemRow${urgent ? " mj_TrackerItemRow_needsyou" : ""}${
                notice ? " mj_TrackerItemRow_notice" : ""
            }${showSeen ? " mj_TrackerItemRow_withSeen" : ""}`}
            aria-label={label}
            onClick={() => onOpen(item.num)}
        >
            <span className="mj_TrackerItemRow_glyph" aria-hidden="true">
                <TrackerGlyph kind={item.kind} />
            </span>
            <span className="mj_TrackerItemRow_main">
                <span className="mj_TrackerItemRow_title">
                    <span className="mj_TrackerItemRow_num">#{item.num}</span>
                    {item.title}
                </span>
                {body ? <span className="mj_TrackerItemRow_body">{body}</span> : null}
                <span className="mj_TrackerItemRow_meta">
                    {origin ? <span className="mj_TrackerItemRow_origin">from {origin}</span> : null}
                    {item.mission_num ? (
                        <span className="mj_TrackerItemRow_missionChip">
                            <MissionGlyph state="open" aria-hidden="true" />#{item.mission_num}
                        </span>
                    ) : null}
                    {statusToken}
                    {item.comment_count > 0 ? (
                        <span className="mj_TrackerItemRow_comments">
                            <CommentBubbleGlyph aria-hidden="true" />
                            {item.comment_count}
                        </span>
                    ) : null}
                </span>
            </span>
            {item.has_image ? (
                <span className="mj_TrackerItemRow_thumb" aria-hidden="true">
                    <ImagePlaceholderGlyph />
                </span>
            ) : null}
        </button>
    );
    if (!showSeen) return row;
    return (
        <div className="mj_TrackerItemRow_wrap">
            {row}
            <button
                type="button"
                className="mj_TrackerAction mj_TrackerItemRow_seen"
                aria-label={`Seen, number ${item.num}`}
                disabled={seenBusy}
                onClick={() => onSeen(item.num)}
            >
                Seen
            </button>
        </div>
    );
}
