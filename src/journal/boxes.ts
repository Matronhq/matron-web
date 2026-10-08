/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Agent boxes as the Mac app shows them: a deterministic hue per box name (BoxChip.swift)
 * and the `A:bc` session tag that leads a chat title (SessionTagText.swift / SessionTag.swift).
 * Same hash, same palette, same mixing, so a box is the same colour on both clients.
 */

import type { AgentRosterEntry, Conversation } from "./types";

/** Apple's documented light sRGB for .blue … .mint, in the order BoxChip.swift freezes. */
const PALETTE: Array<[number, number, number]> = [
    [0, 122, 255], // blue
    [52, 199, 89], // green
    [255, 149, 0], // orange
    [175, 82, 222], // purple
    [48, 176, 199], // teal
    [255, 45, 85], // pink
    [88, 86, 214], // indigo
    [162, 132, 94], // brown
    [50, 173, 230], // cyan
    [0, 199, 190], // mint
];

const FILL_ALPHA = 0.18;
const LIGHT_TEXT_MIX = 0.35; // toward black
const DARK_TEXT_MIX = 0.3; // toward white

/** UTF-8 bytes of a string, without TextEncoder (absent in jsdom and some embedded webviews). */
function utf8Bytes(text: string): number[] {
    const bytes: number[] = [];
    for (const char of text) {
        const point = char.codePointAt(0) ?? 0;
        if (point < 0x80) bytes.push(point);
        else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
        else if (point < 0x10000) {
            bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
        } else {
            bytes.push(
                0xf0 | (point >> 18),
                0x80 | ((point >> 12) & 0x3f),
                0x80 | ((point >> 6) & 0x3f),
                0x80 | (point & 0x3f),
            );
        }
    }
    return bytes;
}

/** FNV-1a 32-bit over the UTF-8 bytes, modulo the palette size (BoxChip.paletteIndex). */
export function paletteIndex(name: string): number {
    let hash = 2166136261;
    for (const byte of utf8Bytes(name)) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash % PALETTE.length;
}

const hex = (value: number): string => Math.round(value).toString(16).padStart(2, "0");
const mix = (rgb: [number, number, number], toward: number, by: number): string =>
    `#${rgb.map((v) => hex(v + (toward - v) * by)).join("")}`;

/** Text colour carrying the box's hue, pulled toward the label colour so it reads at small sizes. */
export function boxTint(name: string, theme: "light" | "dark"): string {
    const base = PALETTE[paletteIndex(name)];
    return theme === "dark" ? mix(base, 255, DARK_TEXT_MIX) : mix(base, 0, LIGHT_TEXT_MIX);
}

/** The pale chip fill: the raw hue at 18% over whatever it sits on. */
export function boxFill(name: string): string {
    const [r, g, b] = PALETTE[paletteIndex(name)];
    return `rgb(${r} ${g} ${b} / ${FILL_ALPHA})`;
}

/** The roster's tag character whole (the journal keeps it to one grapheme, so an emoji survives),
 *  else the box name's first letter upper-cased. */
export function boxLetter(entry: AgentRosterEntry): string {
    const tag = entry.tag_char?.trim();
    if (tag && tag.length > 0) return tag;
    return (entry.name.trim()[0] ?? "?").toUpperCase();
}

/** Title markers the bridge puts ahead of the `[ab] ` short (SessionTag.titleMarkers). */
const MARKERS = ["↔️ ", "🔗 ", "🐣 "];

/** Peels "<marker>[ab] title" into its parts; with no short, the title (minus the marker) comes back whole. */
export function splitTitle(raw: string): { marker: string; short?: string; title: string } {
    const marker = MARKERS.find((candidate) => raw.startsWith(candidate)) ?? "";
    const rest = raw.slice(marker.length);
    // Exactly two letters/digits, then a space and a non-empty title (SessionTag.splitTitle): a
    // bracketed title such as "[WIP] thing" is a title, not a short.
    const match = /^\[([\p{L}\p{N}]{2})\] (\S[\s\S]*)$/u.exec(rest);
    if (!match) return { marker, short: undefined, title: rest };
    return { marker, short: match[1], title: match[2] };
}

/** The roster entry for a conversation's box; undefined when the conversation names no box
 *  (legacy row) or the roster does not list it (not yet received, box removed). */
export function conversationBox(
    conversation: Pick<Conversation, "agent_device_id">,
    roster: AgentRosterEntry[] | undefined,
): AgentRosterEntry | undefined {
    const id = conversation.agent_device_id;
    if (id === null || id === undefined || !roster) return undefined;
    return roster.find((candidate) => candidate.device_id === id);
}

/**
 * The `A:bc` tag for a conversation row, or undefined when there is nothing to show: the Mac
 * gates chips on having two or more boxes (one box means the letter says nothing), and a
 * conversation whose box is unknown (legacy row, roster not yet received) shows no tag.
 */
export function sessionTag(
    conversation: Conversation,
    roster: AgentRosterEntry[] | undefined,
): { letter: string; name: string; short?: string } | undefined {
    if (!roster || roster.length < 2) return undefined;
    const entry = conversationBox(conversation, roster);
    if (!entry) return undefined;
    return { letter: boxLetter(entry), name: entry.name, short: splitTitle(conversation.title).short };
}

/**
 * The same tag for a row that names its box rather than its device (a mission's conversation
 * list carries `box`, the box's name): the same two-box gate, and nothing for an unknown box.
 */
export function sessionTagForBox(
    box: string | null | undefined,
    title: string,
    roster: AgentRosterEntry[] | undefined,
): { letter: string; name: string; short?: string } | undefined {
    if (!roster || roster.length < 2 || !box) return undefined;
    const entry = roster.find((candidate) => candidate.name === box);
    if (!entry) return undefined;
    return { letter: boxLetter(entry), name: entry.name, short: splitTitle(title).short };
}
