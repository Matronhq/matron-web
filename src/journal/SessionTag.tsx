/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The `A:bc` session tag that leads a conversation's title everywhere it is named (sidebar
 * rows, chat header, subagent pills, back button), as SessionTagText does on the Mac: the box
 * letter in the box's hue, semibold; ":" secondary; the short in primary. The bridge's raw
 * "[bc] " prefix never shows. The letter's colour is written as two custom properties so the
 * stylesheet picks the right one per theme without a re-render.
 */

import React from "react";

import { boxTint, sessionTag, splitTitle } from "./boxes";
import { conversationTitle, type AgentRosterEntry, type Conversation } from "./types";

/** The title to display: the bridge's "[ab] " short peeled off; the marker (🐣, ↔️) stays with
 *  the title, as on the Mac, since the web renders no room tag that would replace it. */
export function displayTitle(conversation: Conversation): string {
    return displayRawTitle(conversationTitle(conversation));
}

/** displayTitle for a bare title string (a mission's conversation row, a bridge `auto_title`). */
export function displayRawTitle(raw: string): string {
    const { marker, title } = splitTitle(raw);
    return title ? marker + title : raw;
}

export function SessionTagMark({ tag }: { tag: { letter: string; name: string; short?: string } }): React.ReactElement {
    return (
        <span className="mj_SessionTag">
            <b
                className="mj_SessionTag_letter"
                style={
                    {
                        "--mj-box-light": boxTint(tag.name, "light"),
                        "--mj-box-dark": boxTint(tag.name, "dark"),
                    } as React.CSSProperties
                }
            >
                {tag.letter}
            </b>
            {tag.short && (
                <>
                    <span className="mj_SessionTag_sep">:</span>
                    <span className="mj_SessionTag_short">{tag.short}</span>
                </>
            )}{" "}
        </span>
    );
}

/** Tag (when the roster has two or more boxes and the box is known) followed by the display title. */
export function TaggedTitle({
    conversation,
    agents,
}: {
    conversation: Conversation;
    agents: AgentRosterEntry[] | undefined;
}): React.ReactElement {
    const tag = sessionTag(conversation, agents);
    return (
        <>
            {tag && <SessionTagMark tag={tag} />}
            {displayTitle(conversation)}
        </>
    );
}
