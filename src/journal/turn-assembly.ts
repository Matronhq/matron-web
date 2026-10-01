/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Journal events → operator turns (Developer view off).
 *
 * A turn is the ordered journal events between one operator message and the next. A turn the bridge
 * injects (a routine, a reminder, a room message …) starts at the bridge's line for it, and another
 * agent speaking (an agent chat room) starts its own. Inside a turn every event lands in exactly one bucket:
 *
 *   steps      tool_output and diff events — the agent's own work (the card's rows)
 *   narration  agent text that arrives BEFORE the turn's last step (inside the card)
 *   answer     agent text AFTER the last step (prose below the card)
 *   breaks     break-throughs: prompts, permission requests, images, files, tracker
 *              markers, spawn outcomes, unknown event types — rendered after the card
 *   notices    the bridge talking about the session (compaction, idle resume, queued sends,
 *              restarts) — one tertiary line each, outside the agent tile
 *   errors     a turn-ending error (session ended non-zero, can no longer resume) — .mj_TurnError
 *
 * Pure; no React. A bridge that marks its notices (`payload.notice`) and the first event of a turn
 * it injects (`payload.turn_start`) is read by those flags. For one that does not, bridgeTextKind()
 * and isInjectedTurnStart() fall back to an allowlist of the bridge's fixed wordings.
 */

import { type JournalEvent } from "./types";
import { type Step, stepsOf, type TurnItem } from "./turn-grouping";

export type BridgeTextKind = "notice" | "error";

/** The bridge's own session notices, recognised by their fixed wordings. */
const NOTICE_PATTERNS: readonly RegExp[] = [
    /^🗜️?\s*(Context compacted|\/compact is already queued)/u,
    /^✅\s*(Compacted|Context compacted)\b/u,
    /^⏳\s*(Session was idle|A restart is pending|This session was asleep|Queued — this chat is mid-turn|The usage limit has reset|Still working —|`[^`\n]+` is STILL running)/u,
    /^[⚡📬]\s*(Sending \d+ queued messages?|Sending \/compact|No queued messages)/u,
    /^🔄\s*Restarting\b/u,
    /^(Claude Code|Codex) session restarted\./,
    /^\[Session crashed \(exit (-?\d+|null)\), restarted automatically — attempt \d+\/3\]$/,
    /^Waiting for turn to finish before restarting\b/,
    /^Session stopped\.$/,
    /^\[Session ended \(exit 0\)\]$/,
    /^👋\s*Logged out\b/u,
    /^✅\s*(Allowed once|Always allowing)\b/u,
    /^🛠️?\s*(Coordinator\b|The model this session was on)/u,
    /^⚠️?\s*(Coordinator\b|Routines? |[^\n]* alert\b)[^\n]* — refused: /u,
    /^(✅|⏳|⏰|⚠️?)\s*Session (compact|model switch|carry-on|alert|routine|session control)\b[^\n]*\b(applied|parked|scheduled|failed)\b/u,
    /^⏰\s*(Timer #\d+ (set|fired)|Timers for this conversation|The agent set itself)/u,
    /^⚠️?\s*Couldn't deliver \d+ queued messages? to this chat\b/u,
    /^🔇\s*Not delivered — this chat is muted\./u,
];

/**
 * The bridge's line in front of a turn it injected itself — no operator message comes first, so
 * the line has to open the turn. A routine, journal alert or unseen nudge (🔔), a Coordinator
 * carry-on (🛠), a usage-limit carry-on (🕒), a reminder or timer (⏰), a consent or chat request
 * (🤝), a room message (💬, 📨) and a spawn outcome.
 */
const TURN_START_PATTERNS: readonly RegExp[] = [
    /^🔔\s*(Routines? \S|\d+ important things? ha(s|ve) gone unseen|[^:\n]{1,80}: )/u,
    /^🛠️?\s*Coordinator\b[^:\n]*: carry on(?! once the usage limit resets)/u,
    /^🕒\s*(The usage limit has reset — (sending|carrying)|Model switched — carrying on)/u,
    /^⏰\s*(Reminder #\d+ \(set by the agent|Timer #\d+: sending )/u,
    /^🤝\s*(A consent request is waiting for the user|.+ (asks to join the chat|started a chat with this session|requests a chat with this session))/u,
    /^💬\s*[^\n]+ in "[^\n]*": /u,
    /^📨\s*Delivered \d+ queued messages?\./u,
    /^(🚀|🚫|⌛|❌)\s*Spawn \S+: /u,
];

/** A control line parked while the session is busy: it opens nothing until the turn ends. */
const DEFERRED_TAIL = / once this turn finishes( — |$)/u;

/** Turn-ending errors the bridge reports as text. */
const ERROR_PATTERNS: readonly RegExp[] = [
    /^\[Session ended \(exit (?!0\))-?\d+\)\]$/,
    /^⚠️?\s*(That conversation can no longer be found or resumed|Could not carry on|Could not deliver your (message|answer))/u,
    /^⚠️?\s*Couldn't deliver (your queued message|\d+ queued messages) — the session ended/u,
];

export function bridgeTextKind(body: string): BridgeTextKind | null {
    const text = body.trim();
    if (!text) return null;
    if (ERROR_PATTERNS.some((pattern) => pattern.test(text))) return "error";
    if (NOTICE_PATTERNS.some((pattern) => pattern.test(text))) return "notice";
    if (TURN_START_PATTERNS.some((pattern) => pattern.test(text))) return "notice";
    return null;
}

/** `payload.notice` kinds that are not a plain notice; any other value (a newer kind too) is one. */
const NOTICE_FLAG_KINDS: Readonly<Record<string, BridgeTextKind>> = { delivery_failed: "error" };

/** How an agent text reads: by the bridge's `payload.notice` when it carries one, else its wording. */
export function bridgeEventKind(event: JournalEvent): BridgeTextKind | null {
    if (event.type !== "text" || isOperatorEvent(event)) return null;
    const notice = asString(event.payload.notice);
    if (notice) return NOTICE_FLAG_KINDS[notice] ?? "notice";
    return bridgeTextKind(agentText(event));
}

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

export function isOperatorEvent(event: JournalEvent): boolean {
    return event.sender.startsWith("user:");
}

/**
 * What the operator sends (the journal's CLIENT_SEND_TYPES), plus the user markers the bridge turns
 * into a turn of their own: an item reply (lib/items-turn.js) and a Coordinator role change.
 */
const TURN_OPENING_TYPES: ReadonlySet<string> = new Set(["text", "image", "file", "item", "coordinator"]);

/**
 * An operator event that opens a new turn. An answer to the agent's own question
 * (`prompt_reply`) does not: the agent carries on with the same turn after it, so its steps stay
 * in the same card. Nor does a marker the journal writes under the user's name (a routine saved,
 * a mission, a memory): the operator didn't say anything to the agent.
 */
export function isTurnBoundary(event: JournalEvent): boolean {
    return isOperatorEvent(event) && TURN_OPENING_TYPES.has(event.type) && !asString(event.payload.fallback_for);
}

/**
 * A bridge text that starts a turn the bridge injected (a routine, reminder, nudge, room message …).
 * Text the bridge mirrors on the user's behalf (`from: "user"`, e.g. a self-restart's carry-on)
 * opens one too. A control line parked until the turn ends ("… once this turn finishes") does not.
 */
export function isInjectedTurnStart(event: JournalEvent): boolean {
    // The bridge's own marker, on whatever event it put it.
    const marker = event.payload.turn_start;
    if (marker && typeof marker === "object" && !isOperatorEvent(event)) return true;
    const body = agentText(event).trim();
    if (!body) return false;
    if (event.payload.from === "user") return true;
    const first = body.split("\n")[0];
    return TURN_START_PATTERNS.some((pattern) => pattern.test(first)) && !DEFERRED_TAIL.test(first);
}

/** A Codex generic completed item the bridge publishes as a one-token code span. */
const CODEX_ITEM_TEXT = /^`([A-Z][A-Za-z0-9 ]{0,79})`$/;

/** Body of an agent text event, or "" when it is not a plain agent text. */
function agentText(event: JournalEvent): string {
    if (event.type !== "text" || isOperatorEvent(event)) return "";
    if (asString(event.payload.fallback_for)) return "";
    return asString(event.payload.body);
}

/**
 * The step a journal event represents, or null. `previousTs` (the preceding event in the turn)
 * approximates the step's duration: the bridge publishes a command at completion and a diff at
 * tool-use time, and neither carries a start time.
 */
export function eventToStep(event: JournalEvent, previousTs?: number): Step | null {
    const payload = event.payload;
    const ms = previousTs !== undefined && event.ts > previousTs ? event.ts - previousTs : undefined;
    if (event.type === "tool_output") {
        const command = asString(payload.command) || asString(payload.tool_name);
        const exit =
            typeof payload.exit_code === "number" ? payload.exit_code : payload.exit_code === null ? null : undefined;
        const status = asString(payload.status);
        const failed =
            payload.denied === true ||
            (typeof exit === "number" && exit !== 0) ||
            status === "failed" ||
            status === "declined";
        return {
            kind: "step",
            id: `e${event.seq}`,
            // Codex's legacy exec transport reports file edits as a `file_change` tool_output.
            tool: command === "file_change" ? "file_change" : "Bash",
            input: { command },
            // exit_code null = the bridge never observed an exit (killed, or the session died
            // under the command): never report that as a pass.
            status: failed ? "failed" : exit === null ? "stopped" : "ok",
            exit,
            ms,
            source: event,
        };
    }
    if (event.type === "diff") {
        const path = asString(payload.display_path) || asString(payload.file_path);
        return {
            kind: "step",
            id: `e${event.seq}`,
            tool: asString(payload.tool) || "Edit",
            input: { path },
            status: "ok",
            added: typeof payload.added === "number" ? payload.added : undefined,
            removed: typeof payload.removed === "number" ? payload.removed : undefined,
            newFile: typeof payload.new_file === "boolean" ? payload.new_file : undefined,
            ms,
            source: event,
        };
    }
    const codexItem = CODEX_ITEM_TEXT.exec(agentText(event).trim());
    if (codexItem) {
        const name = codexItem[1];
        return {
            kind: "step",
            id: `e${event.seq}`,
            tool: /^web ?search$/i.test(name) ? "WebSearch" : name,
            input: {},
            status: "ok",
            ms,
            source: event,
        };
    }
    return null;
}

export interface Turn {
    /** Stable key: the seq of the turn's first event. */
    key: string;
    /** The operator event that opened the turn; absent for events before the first message. */
    operator?: JournalEvent;
    /** The bridge line that opened an injected turn (isInjectedTurnStart); shown as a notice row. */
    opener?: JournalEvent;
    /** Every non-operator event of the turn, in order (the Show-the-work-ON rendering). */
    events: JournalEvent[];
    /** Card content: steps and narration, in order. */
    items: TurnItem[];
    breaks: JournalEvent[];
    /** The operator's answers to the agent's questions during the turn (`prompt_reply`). */
    replies: JournalEvent[];
    answer: JournalEvent[];
    errors: JournalEvent[];
    notices: JournalEvent[];
    /** ms: operator message or the first event → the last event. */
    startTs: number;
    endTs: number;
}

export type ThreadRow =
    { kind: "operator"; event: JournalEvent } | { kind: "turn"; turn: Turn } | { kind: "notice"; event: JournalEvent };

type Classified =
    { bucket: "step"; step: Step } | { bucket: "text"; text: string } | { bucket: "break" | "error" | "notice" };

function classifyAgentEvent(event: JournalEvent, previousTs: number | undefined): Classified {
    const kind = bridgeEventKind(event);
    if (kind === "error") return { bucket: "error" };
    if (kind === "notice") return { bucket: "notice" };
    const step = eventToStep(event, previousTs);
    if (step) return { bucket: "step", step };
    if (event.type === "text") return { bucket: "text", text: agentText(event) };
    return { bucket: "break" };
}

function emptyTurn(first: JournalEvent, operator?: JournalEvent): Turn {
    return {
        key: String(first.seq),
        operator,
        events: [],
        items: [],
        breaks: [],
        replies: [],
        answer: [],
        errors: [],
        notices: [],
        startTs: first.ts,
        endTs: first.ts,
    };
}

/** Group visible journal events (already filtered by the timeline) into operator turns. */
export function assembleTurns(events: readonly JournalEvent[]): Turn[] {
    const turns: Turn[] = [];
    let current: Turn | null = null;
    // Per turn: the text events in order with their position relative to the steps, resolved
    // into narration vs answer once the turn's last step is known.
    let texts: Array<{ event: JournalEvent; text: string; itemIndex: number }> = [];
    let lastTs: number | undefined;
    // The agent the turn's tile speaks for: another agent speaking (an agent chat room) gets its own.
    let turnAgent: string | undefined;

    const finish = (): void => {
        turnAgent = undefined;
        if (!current) return;
        const turn = current;
        const steps = stepsOf(turn.items);
        const lastStep = steps[steps.length - 1];
        const lastStepIndex = lastStep ? turn.items.indexOf(lastStep) : -1;
        // Walk texts backwards so splicing narration into items keeps earlier indexes valid.
        for (let index = texts.length - 1; index >= 0; index -= 1) {
            const entry = texts[index];
            if (entry.itemIndex <= lastStepIndex) {
                turn.items.splice(entry.itemIndex, 0, { kind: "narration", text: entry.text });
            } else {
                turn.answer.unshift(entry.event);
            }
        }
        texts = [];
        turns.push(turn);
        current = null;
    };

    for (const event of events) {
        if (isTurnBoundary(event)) {
            finish();
            current = emptyTurn(event, event);
            lastTs = event.ts;
            continue;
        }
        if (isInjectedTurnStart(event)) {
            finish();
            turnAgent = event.sender.startsWith("agent:") ? event.sender : undefined;
            lastTs = event.ts;
            // The bridge's line (or the text it mirrors for the user) heads the turn; a step or an
            // answer the bridge marked is the turn's own content.
            if (event.type === "text" && (bridgeEventKind(event) === "notice" || event.payload.from === "user")) {
                current = { ...emptyTurn(event), opener: event };
                continue;
            }
            current = emptyTurn(event);
        }
        const isAgent = event.sender.startsWith("agent:");
        if (isAgent && turnAgent !== undefined && event.sender !== turnAgent) finish();
        if (isAgent && turnAgent === undefined) turnAgent = event.sender;
        if (!current) current = emptyTurn(event);
        const turn = current;
        turn.events.push(event);
        // A marker the journal writes under the user's name: shown in the turn, not as the operator.
        const marker = isOperatorEvent(event) && event.type !== "prompt_reply";
        // Duration ends at the turn's last own event: bridge notices and markers don't extend it.
        if (!marker && bridgeEventKind(event) !== "notice") turn.endTs = Math.max(turn.endTs, event.ts);
        if (marker) {
            turn.breaks.push(event);
            continue;
        }
        if (isOperatorEvent(event)) {
            turn.replies.push(event);
            lastTs = event.ts;
            continue;
        }
        const classified = classifyAgentEvent(event, lastTs);
        lastTs = event.ts;
        switch (classified.bucket) {
            case "step":
                turn.items.push(classified.step);
                break;
            case "text":
                // Narration sits before the step that follows it: remember where it arrived.
                texts.push({ event, text: classified.text, itemIndex: turn.items.length });
                break;
            case "break":
                turn.breaks.push(event);
                break;
            case "error":
                turn.errors.push(event);
                break;
            case "notice":
                turn.notices.push(event);
                break;
        }
    }
    finish();
    return turns;
}

/** The operator's free-text answers. A picked option (`choice` or `label`) shows on its prompt card instead. */
function freeTextReplies(turn: Turn): JournalEvent[] {
    return turn.replies.filter(
        (event) => !asString(event.payload.choice) && !asString(event.payload.label) && asString(event.payload.text),
    );
}

function hasAgentContent(turn: Turn): boolean {
    return Boolean(turn.items.length || turn.breaks.length || turn.answer.length || turn.errors.length);
}

/**
 * The operator's replies the agent tile shows: free-text answers, in a tile that has agent content
 * of its own. A turn holding nothing else shows its answers as operator rows (threadRows).
 */
export function shownReplies(turn: Turn): JournalEvent[] {
    return hasAgentContent(turn) ? freeTextReplies(turn) : [];
}

/**
 * The thread as rows: each turn's operator bubble, then its agent tile (only when it has
 * anything to show), then its notices in the order they happened. A free-text answer in a
 * turn with no agent content (the operator answered an older question after a new message)
 * is an operator row of its own, not an agent tile.
 */
export function threadRows(turns: readonly Turn[], options: { liveLastTurn?: boolean } = {}): ThreadRow[] {
    const rows: ThreadRow[] = [];
    for (const turn of turns) {
        if (turn.operator) rows.push({ kind: "operator", event: turn.operator });
        if (turn.opener) rows.push({ kind: "notice", event: turn.opener });
        const agentContent = hasAgentContent(turn);
        if (!agentContent) for (const event of freeTextReplies(turn)) rows.push({ kind: "operator", event });
        if (
            // A live last turn gets its tile before anything is journaled: the running step
            // (a command publishes only when it completes) shows as the card's live line.
            (options.liveLastTurn && turn === turns[turns.length - 1]) ||
            agentContent
        ) {
            rows.push({ kind: "turn", turn });
        }
        for (const event of turn.notices) rows.push({ kind: "notice", event });
    }
    return rows;
}
