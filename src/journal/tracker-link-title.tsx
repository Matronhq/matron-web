/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

// The title beside a tracker link. Agents sometimes link a real number that is not the one they
// meant, and a bare `#412` gives the reader no way to tell. So every tracker link in rendered
// markdown that does not already name its target shows what its number really is: its kind and
// title. A link whose text carries the right title gets no chip. When the link text names a
// different title (or a number that does not exist), the chip is marked as a mismatch, so the
// wrong link stands out at a glance.

import React, { useContext, useEffect, useState } from "react";

import type { NumberLookupOutcome } from "./types";

/** Looks a link up: `user` from a `/u/<name>/<n>` link, or null for an own-number link. */
export type TrackerLinkInfo = (user: string | null, num: number) => Promise<NumberLookupOutcome>;

/** Provided where markdown renders for the signed-in user (MatronJournalClient.trackerLinkInfo). */
export const TrackerLinkInfoContext = React.createContext<TrackerLinkInfo | undefined>(undefined);

const STOPWORDS = new Set([
    "a",
    "an",
    "the",
    "of",
    "to",
    "for",
    "and",
    "or",
    "on",
    "in",
    "at",
    "by",
    "with",
    "from",
    "is",
    "it",
    "this",
    "that",
    "item",
    "one",
    "new",
]);

// Words a link label uses without naming anything ("click here", "read more").
const GENERIC = new Set([
    "here",
    "click",
    "read",
    "more",
    "see",
    "link",
    "open",
    "view",
    "details",
    "this",
    "that",
    "it",
]);

// An address in a title is one word, compared whole: its pieces (https, the host, the path's
// words) would otherwise match any other title that carries an address on the same site.
const URL_IN_TITLE_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s<>()"']+/gu;

function plainWords(text: string): string[] {
    return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** The words of a title; `cut` is set when it ends with an ellipsis. */
function tokens(text: string): string[] & { cut?: boolean } {
    const full = text
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .toLowerCase();
    const plain = full.replace(/(\.\.\.|…)\s*$/u, "");
    const out: string[] & { cut?: boolean } = [];
    // Marked cut short with an ellipsis: only then may an address at the end be a prefix of the
    // real one.
    out.cut = plain !== full;
    let last = 0;
    for (const m of plain.matchAll(URL_IN_TITLE_RE)) {
        out.push(...plainWords(plain.slice(last, m.index)));
        out.push(m[0].replace(/[.,;:!?/]+$/u, ""));
        last = m.index + m[0].length;
    }
    out.push(...plainWords(plain.slice(last)));
    return out;
}

const isAddress = (t: string): boolean => t.includes("://");

function sameWord(a: string, b: string): boolean {
    if (a === b) return true;
    // Addresses match whole: ".../pull/1" is not ".../pull/10".
    if (isAddress(a) || isAddress(b)) return false;
    return Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));
}

/**
 * Does a title written in a link name this record? The same rule the bridge checks agents' links
 * with: a prefix (the last word possibly cut short), an abbreviation, or a paraphrase that keeps
 * most of the words passes; a title about something else does not.
 */
export function titleMatches(written: string, actual: string): boolean {
    const w = tokens(written);
    const a = tokens(actual);
    if (!w.length || !a.length) return false;
    const cutShort = (t: string, x: string): boolean => x.startsWith(t) && (!isAddress(t) || !!w.cut);
    if (w.length <= a.length && w.every((t, i) => t === a[i] || (i === w.length - 1 && cutShort(t, a[i])))) {
        return true;
    }
    const content = w.filter((t) => !STOPWORDS.has(t));
    const words = content.length ? content : w;
    const hits = words.filter((t) => a.some((x) => sameWord(t, x))).length;
    return hits >= Math.min(2, words.length) && hits / words.length >= 0.6;
}

const TEXT_RE =
    /^(?:(?:item|mission|milestone|project|question|task|decision|notice)\s+)?#([1-9][0-9]{0,14})(?![\p{L}\p{N}])(.*)$/iu;

/** The number and title written in a link's text: "#12 Title", "item #12: Title", "Title". */
export function writtenLink(text: string): { num: number | null; title: string } {
    // A link whose text is a URL (an autolinked `matron://item/68` or `/u/…` link) names no
    // title: it is a bare link.
    if (/^[a-z][a-z0-9+.-]*:\/\/\S*$/i.test(text.trim())) return { num: null, title: "" };
    const plain = text.replace(/[*_`~]+/g, " ").trim();
    const match = TEXT_RE.exec(plain);
    const title = (match ? match[2] : plain)
        .trim()
        .replace(/^[\s:–—\-·|,.(]+/u, "")
        .replace(/\)+$/u, "")
        .trim()
        .replace(/^["'“‘«]+|["'”’»]+$/gu, "")
        .trim();
    return { num: match ? Number(match[1]) : null, title };
}

interface TrackerLinkTargetProps {
    user: string | null;
    num: number;
    linkText: string;
}

/** The chip inside a tracker link: what the number points at. Nothing while unknown, or when the link text already names it. */
export function TrackerLinkTarget({ user, num, linkText }: TrackerLinkTargetProps): React.ReactElement | null {
    const info = useContext(TrackerLinkInfoContext);
    const [outcome, setOutcome] = useState<NumberLookupOutcome | null>(null);

    useEffect(() => {
        if (!info) return;
        let live = true;
        info(user, num).then(
            (result) => {
                if (live) setOutcome(result);
            },
            () => {
                if (live) setOutcome({ status: "failed" });
            },
        );
        return () => {
            live = false;
        };
    }, [info, user, num]);

    if (!outcome || outcome.status === "failed") return null;
    if (outcome.status === "none") {
        return (
            <span
                className="mj_TrackerLinkTarget mj_TrackerLinkTarget--mismatch"
                title={`#${num} does not exist, or is not visible to you`}
            >
                ⚠ not found
            </span>
        );
    }
    const { kind, title } = outcome.hit;
    const written = writtenLink(linkText);
    const wrongNumber = written.num !== null && written.num !== num;
    if (!title) {
        return wrongNumber ? (
            <span
                className="mj_TrackerLinkTarget mj_TrackerLinkTarget--mismatch"
                title={`This link says #${written.num} but goes to #${num}.`}
            >
                ⚠ {kind}
            </span>
        ) : (
            <span className="mj_TrackerLinkTarget">{kind}</span>
        );
    }
    // The link already says what it points at: a chip would only repeat it.
    if (!wrongNumber && written.title && titleMatches(written.title, title)) return null;
    // Link text that names something ("#12 Some title", or a few words) and does not match is
    // flagged; a label like "here" or "read more" is not a claim about the target.
    const claims =
        written.num !== null || tokens(written.title).filter((t) => !STOPWORDS.has(t) && !GENERIC.has(t)).length >= 2;
    const mismatch = wrongNumber || (claims && !!written.title);
    let hint = title;
    if (wrongNumber) hint = `This link says #${written.num} but goes to #${num}, the ${kind} "${title}".`;
    else if (mismatch) hint = `#${num} is not "${written.title}": it is the ${kind} "${title}".`;
    return (
        <span
            className={mismatch ? "mj_TrackerLinkTarget mj_TrackerLinkTarget--mismatch" : "mj_TrackerLinkTarget"}
            title={hint}
        >
            {mismatch ? "⚠ " : ""}
            {kind} · {title}
        </span>
    );
}
