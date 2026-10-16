/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Person-to-person consent cards: a contact request, a mission share, a session share and a room
 * with another person's agent (a "talk" when the other side picks the session). Each arrives as a
 * `permission_request` with one of those payload kinds, and the journal files a mirror tracker
 * item for the same ask, linked `matron://consent/<kind>/<id>`. That item's buttons are the only
 * way to answer: nothing reads a `prompt_reply` to these cards. So the card here is inert. It says
 * who is asking, which way and about what, and opens the mirror item.
 */

import React, { useEffect, useState } from "react";

import { asString, type EventPayload, type JournalEvent } from "./types";

export type PeopleCardKind = "contact_request" | "mission_share" | "session_share" | "person_room";

const PEOPLE_CARD_KINDS: ReadonlySet<string> = new Set<PeopleCardKind>([
    "contact_request",
    "mission_share",
    "session_share",
    "person_room",
]);

/** The consent link segment and the payload field carrying its id, per card kind. */
const CONSENT_LINKS: Record<PeopleCardKind, { segment: string; idField: string }> = {
    contact_request: { segment: "contact", idField: "contact_id" },
    mission_share: { segment: "share", idField: "grant_id" },
    session_share: { segment: "session", idField: "session_share_id" },
    person_room: { segment: "room", idField: "room_link_id" },
};

export interface PeopleCard {
    kind: PeopleCardKind;
    direction: "in" | "out";
    /** A room the other person's side picks the session for. */
    talk: boolean;
    /** The other person. */
    person: string;
    /** Header label. */
    label: string;
    /** One line: who asks for what. */
    headline: string;
    /** What it is about: the room's topic, the mission's or the session's title; "" when none. */
    topic: string;
    /** The label of the topic row. */
    topicLabel: string;
    /** The asking agent's reason, when the card carries one. */
    why: string;
    /** The mirror item's `matron://consent/...` link; null when the payload lacks a usable id. */
    consentUrl: string | null;
}

export function isPeopleCardPayload(payload: EventPayload): boolean {
    return PEOPLE_CARD_KINDS.has(asString(payload.kind));
}

/** A string field of a nested payload object, trimmed; "" when absent. */
function fieldOf(value: unknown, field: string): string {
    return value && typeof value === "object" ? asString((value as EventPayload)[field]).trim() : "";
}

const nameOf = (value: unknown): string => fieldOf(value, "name");

function consentUrlOf(kind: PeopleCardKind, payload: EventPayload): string | null {
    const { segment, idField } = CONSENT_LINKS[kind];
    const id = asString(payload[idField]);
    // The journal's ids are plain tokens; anything that could change the link's shape is not one.
    return id && /^[^/?#\s]+$/.test(id) ? `matron://consent/${segment}/${id}` : null;
}

/** Reads a person-to-person card payload, or null when `payload` is not one. */
export function parsePeopleCard(payload: EventPayload): PeopleCard | null {
    const kind = asString(payload.kind);
    if (!PEOPLE_CARD_KINDS.has(kind)) return null;
    const k = kind as PeopleCardKind;
    const direction = asString(payload.direction) === "in" ? "in" : "out";
    const talk = k === "person_room" && payload.talk === true;
    let person = "";
    if (k === "contact_request") person = nameOf(payload.peer);
    else if (k === "mission_share") person = nameOf(direction === "out" ? payload.grantee : payload.owner);
    else person = nameOf(payload.person);
    const who = person || "Someone";
    const whose = person ? `${person}'s` : "another person's";
    const Whose = person ? `${person}'s` : "Another person's";
    const out = direction === "out";

    let label: string;
    let headline: string;
    let topic = "";
    let topicLabel = "About";
    switch (k) {
        case "contact_request":
            label = "Contact request";
            headline = out
                ? `Your agent asks to add ${person || "someone"} as a contact`
                : `${who} wants to add you as a contact`;
            break;
        case "mission_share":
            label = "Mission share";
            headline = out
                ? `Your agent asks to share a mission with ${person || "someone"}`
                : `${who} wants to share a mission with you`;
            topic = fieldOf(payload.mission, "title");
            topicLabel = "Mission";
            break;
        case "session_share":
            label = "Session share";
            headline = `Your agent asks to let ${whose} agents reach this session`;
            topic = asString(payload.session_title).trim();
            topicLabel = "Session";
            break;
        default:
            label = talk ? "Talk request" : "Room with another person";
            if (talk) {
                headline = out ? `Your agent asks to talk with ${person || "someone"}` : `${Whose} agent wants to talk`;
            } else {
                headline = out
                    ? `Your agent asks to talk with ${whose} agent`
                    : `${Whose} agent wants to talk with your session`;
            }
            topic = asString(payload.topic).trim();
            break;
    }
    return {
        kind: k,
        direction,
        talk,
        person,
        label,
        headline,
        topic,
        topicLabel,
        why: asString(payload.justification).trim(),
        consentUrl: consentUrlOf(k, payload),
    };
}

export function PromptPeopleGlyph(): React.ReactElement {
    return (
        <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
            <path d="M16 5.5a3 3 0 0 1 0 5" />
            <path d="M17.5 14a5.5 5.5 0 0 1 3 5" />
        </svg>
    );
}

function formatTime(timestamp: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(timestamp));
}

export const PEOPLE_CARD_HINT = "Answer in your tracker (For you)";

type MirrorLookup = { kind: "looking" } | { kind: "found"; num: number } | { kind: "missing" };

/**
 * The inert card. `findItem` resolves the mirror item's number (null when it can't be found);
 * `onOpenItem` opens it. Without a mirror the card says where to answer instead.
 */
export function PeopleCardView({
    event,
    card,
    findItem,
    onOpenItem,
}: {
    event: JournalEvent;
    card: PeopleCard;
    findItem: (convoId: string, consentUrl: string) => Promise<number | null>;
    onOpenItem: (num: number) => void;
}): React.ReactElement {
    const { consentUrl } = card;
    const [mirror, setMirror] = useState<MirrorLookup>(() => (consentUrl ? { kind: "looking" } : { kind: "missing" }));
    useEffect(() => {
        if (!consentUrl) {
            setMirror({ kind: "missing" });
            return;
        }
        let live = true;
        setMirror({ kind: "looking" });
        findItem(event.convo_id, consentUrl).then(
            (num) => {
                if (live) setMirror(num === null ? { kind: "missing" } : { kind: "found", num });
            },
            () => {
                if (live) setMirror({ kind: "missing" });
            },
        );
        return () => {
            live = false;
        };
        // findItem is a fresh closure each render; the lookup depends only on what it looks up.
    }, [event.convo_id, consentUrl]);

    const fields: Array<[string, string, string]> = [];
    if (card.topic) fields.push(["topic", card.topicLabel, card.topic]);
    if (card.why) fields.push(["why", "Why", card.why]);

    return (
        <div className={`mj_PromptCard mj_PeopleCard mj_PeopleCard_${card.direction}`}>
            <div className="mj_PromptHeader">
                <span className="mj_PromptLabel">{card.label}</span>
                <time className="mj_PromptTime" dateTime={new Date(event.ts).toISOString()}>
                    {formatTime(event.ts)}
                </time>
            </div>
            <div className="mj_PromptBody">
                <span className="mj_PromptGlyph" aria-hidden="true">
                    <PromptPeopleGlyph />
                </span>
                <span className="mj_PromptQuestion">{card.headline}</span>
            </div>
            {fields.length > 0 && (
                <div className="mj_SpawnDetails">
                    {fields.map(([key, label, value]) => (
                        <div key={key} className={`mj_SpawnDetail mj_PeopleDetail_${key}`}>
                            <span className="mj_SpawnDetail_label">{label}</span>
                            <span className="mj_SpawnDetail_value">{value}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="mj_PromptOptions mj_PeopleCard_footer">
                {mirror.kind === "found" ? (
                    <button type="button" className="mj_PeopleCard_open" onClick={() => onOpenItem(mirror.num)}>
                        Answer in the tracker
                    </button>
                ) : (
                    <span className="mj_PeopleCard_hint">{PEOPLE_CARD_HINT}</span>
                )}
            </div>
        </div>
    );
}
