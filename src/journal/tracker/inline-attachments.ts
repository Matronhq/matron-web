/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Inline attachments in tracker items. An item body or a comment body may place one of its OWN
 * attachments in the text with `![caption](attachment:<blob_ref>)`. This module splits such a body
 * into ordered segments — text, attachment, text, … — plus the attachments no ref used, which still
 * render at the end as before. Pure: no React, no DOM.
 *
 * The rules (shared by every Matron client):
 * - A ref resolves only when its blob_ref is in the attachments passed in (that body's own).
 * - Each attachment shows once: the first resolving ref places it; any later ref to the same blob,
 *   and any ref that does not resolve, becomes its caption text (nothing when the caption is empty)
 *   and is never fetched.
 * - Refs inside fenced code blocks or inline code spans are literal text.
 * - Text segments that are empty or whitespace-only are dropped; blank lines at a text segment's
 *   edges are trimmed.
 */

import type { TrackerAttachment } from "../types";

export type InlineSegment =
    { type: "text"; text: string } | { type: "attachment"; attachment: TrackerAttachment; caption: string };

export interface InlineSplit {
    segments: InlineSegment[];
    /** Attachments no ref placed, in their original order. */
    trailing: TrackerAttachment[];
}

/** The shared ref grammar. Global; callers reset `lastIndex` (or use matchAll). */
const REF_PATTERN = /!\[([^\]\n]*)\]\(attachment:([A-Za-z0-9_-]{1,128})\)/g;

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/** Half-open [start, end) ranges of the body that are code and so never hold a ref. */
function codeRanges(body: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    // Pass 1: fenced code blocks, line by line. An unclosed fence runs to the end of the body.
    const prose: Array<[number, number]> = [];
    let offset = 0;
    let fence: { char: string; length: number; start: number } | null = null;
    let proseStart = 0;
    for (const line of body.split("\n")) {
        const lineEnd = offset + line.length;
        const next = Math.min(body.length, lineEnd + 1);
        if (fence) {
            const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
            if (close.test(line)) {
                ranges.push([fence.start, lineEnd]);
                fence = null;
                proseStart = next;
            }
        } else {
            const open = FENCE_OPEN.exec(line);
            // A backtick fence's info string may not contain a backtick (CommonMark).
            if (open && !(open[1][0] === "`" && line.slice(open[0].length).includes("`"))) {
                if (offset > proseStart) prose.push([proseStart, offset]);
                fence = { char: open[1][0], length: open[1].length, start: offset };
            }
        }
        offset = next;
    }
    if (fence) ranges.push([fence.start, body.length]);
    else if (body.length > proseStart) prose.push([proseStart, body.length]);

    // Pass 2: inline code spans inside the prose. A run of N backticks opens a span that the next
    // run of exactly N backticks closes; a run with no partner is literal backticks.
    for (const [start, end] of prose) {
        const runs: Array<[number, number]> = [];
        for (let index = start; index < end;) {
            if (body[index] !== "`") {
                index += 1;
                continue;
            }
            let runEnd = index;
            while (runEnd < end && body[runEnd] === "`") runEnd += 1;
            runs.push([index, runEnd - index]);
            index = runEnd;
        }
        for (let open = 0; open < runs.length; open += 1) {
            const [openAt, length] = runs[open];
            const close = runs.findIndex((run, at) => at > open && run[1] === length);
            if (close === -1) continue;
            ranges.push([openAt, runs[close][0] + length]);
            open = close;
        }
    }
    return ranges;
}

/**
 * True when the ref at [start, end) is code: a code range covers its start, or one opens inside it
 * and runs past its end. A code span wholly inside the ref (backticks in the caption) is not.
 */
function insideCode(ranges: Array<[number, number]>, start: number, end: number): boolean {
    return ranges.some(([from, to]) => (from <= start && start < to) || (from > start && from < end && to > end));
}

/** Splits a body into text and attachment segments, following the shared inline-attachment rules. */
export function splitInlineAttachments(body: string, attachments: readonly TrackerAttachment[]): InlineSplit {
    const byRef = new Map<string, TrackerAttachment>();
    for (const attachment of attachments) {
        if (!byRef.has(attachment.blob_ref)) byRef.set(attachment.blob_ref, attachment);
    }
    const used = new Set<string>();
    const segments: InlineSegment[] = [];
    const ranges = body.includes("attachment:") ? codeRanges(body) : [];

    let buffer = "";
    // True while the buffered text directly follows a placed attachment on the same line.
    let afterAttachment = false;
    const flush = (): void => {
        let text = buffer;
        if (afterAttachment) text = text.replace(/^[ \t]+/, "");
        text = text.replace(/^(?:[ \t]*\n)+/, "");
        text = text.trimEnd();
        if (text.trim()) segments.push({ type: "text", text });
        buffer = "";
    };

    let cursor = 0;
    for (const match of body.matchAll(REF_PATTERN)) {
        const start = match.index;
        const end = start + match[0].length;
        if (insideCode(ranges, start, end)) continue;
        const [, caption, ref] = match;
        buffer += body.slice(cursor, start);
        cursor = end;
        const attachment = byRef.get(ref);
        if (attachment && !used.has(ref)) {
            used.add(ref);
            flush();
            segments.push({ type: "attachment", attachment, caption });
            afterAttachment = true;
        } else {
            buffer += caption;
        }
    }
    buffer += body.slice(cursor);
    flush();

    const trailing: TrackerAttachment[] = [];
    const seen = new Set<string>();
    for (const attachment of attachments) {
        if (used.has(attachment.blob_ref) || seen.has(attachment.blob_ref)) continue;
        seen.add(attachment.blob_ref);
        trailing.push(attachment);
    }
    return { segments, trailing };
}

/**
 * The body with every inline ref turned into its caption text (nothing for an empty caption), for
 * surfaces that show the text without the attachments: list-row previews and timeline cards.
 */
export function inlineRefsToText(body: string): string {
    if (!body.includes("attachment:")) return body;
    return splitInlineAttachments(body, [])
        .segments.map((segment) => (segment.type === "text" ? segment.text : ""))
        .join("\n\n");
}
