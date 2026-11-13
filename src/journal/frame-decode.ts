/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { parseBoxStatus } from "./api";
import {
    type JournalControlFrame,
    type JournalEphemeralFrame,
    type JournalEvent,
    type JournalRpcFrame,
    type ServerFrame,
    isObject,
} from "./types";

// Runtime decoding at the WebSocket frame boundary. connection.ts used to cast
// `JSON.parse(data) as ServerFrame`, so every consumer trusted field names and types on faith.
// This module narrows each frame shape before it reaches the caches:
//
//   - A frame with no recognised discriminant is rejected and dropped by connection.ts.
//   - A conversation-scoped ephemeral frame whose optional sub-shape is malformed (an unknown
//     activity state, a limits entry that would throw in the merge) has just that sub-shape
//     stripped. Every store branch is guarded, so an absent sub-shape means "no update" and the
//     last good value survives.
//   - Every rejection or narrowing is reported through a console diagnostic.
//
// Journal events pass through unvalidated: they are sequenced, so dropping one at the boundary
// would let the next row advance the durable cursor past it. A malformed sequenced row is
// handled by the client (halt and re-snapshot), not here.

export type FrameDecodeResult = { ok: true; frame: ServerFrame; narrowed?: string[] } | { ok: false; reason: string };

// Percentages come from the host as whole numbers; anything outside 0..100 is a wire bug.
const PCT_MIN = 0;
const PCT_MAX = 100;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isPercent(value: unknown): value is number {
    return isFiniteNumber(value) && value >= PCT_MIN && value <= PCT_MAX;
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

// status.vitals: { cpu_pct, ram_pct, sampled_at_ms }, all numbers.
function isValidStatusVitals(value: unknown): boolean {
    return (
        isObject(value) && isFiniteNumber(value.sampled_at_ms) && isPercent(value.cpu_pct) && isPercent(value.ram_pct)
    );
}

// status.context: { tokens, window, pct }; the context bar reads all three as finite numbers.
function isValidStatusContext(value: unknown): boolean {
    return isObject(value) && isFiniteNumber(value.tokens) && isFiniteNumber(value.window) && isFiniteNumber(value.pct);
}

// status.limits: the status merge dereferences `limit.id` on every element, so a single
// null entry would throw, close the socket, and (because the server replays status) fail again
// on every reconnect. Each entry needs the two fields consumers rely on; one bad entry strips
// the whole array.
function isValidLimitsArray(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.every(
        (entry) =>
            isObject(entry) &&
            isString(entry.label) &&
            isFiniteNumber(entry.percent) &&
            (entry.id === undefined || isString(entry.id)),
    );
}

const ACTIVITY_STATES = new Set(["thinking", "tool", "idle"]);

function isValidActivity(value: unknown): boolean {
    if (!isObject(value)) return false;
    if (!isString(value.state) || !ACTIVITY_STATES.has(value.state)) return false;
    return value.detail === undefined || isString(value.detail);
}

const TOOL_STREAM_EVENTS = new Set(["append", "sync", "end"]);

function isValidToolStream(value: unknown): boolean {
    return isObject(value) && isString(value.event) && TOOL_STREAM_EVENTS.has(value.event);
}

// Control frames dispatch on `op`, so a missing op is unusable. Everything else is optional and
// read defensively by the consumers.
function decodeControl(raw: Record<string, unknown>): FrameDecodeResult {
    if (!isString(raw.op)) return { ok: false, reason: "control:op" };
    return { ok: true, frame: raw as unknown as JournalControlFrame };
}

// Ephemeral frames carry independent optional sub-shapes (status, activity, tool_stream). A
// malformed one is stripped rather than dropping the frame, so a valid activity still lands
// even if the status half of the same frame is garbage.
function decodeEphemeral(raw: Record<string, unknown>): FrameDecodeResult {
    const out: Record<string, unknown> = { ...raw };
    const narrowed: string[] = [];

    if (out.convo_id !== undefined && !isString(out.convo_id)) {
        delete out.convo_id;
        narrowed.push("convo_id");
    }
    if (out.status !== undefined) {
        if (!isObject(out.status)) {
            delete out.status;
            narrowed.push("status");
        } else {
            const status: Record<string, unknown> = { ...out.status };
            if (status.vitals !== undefined && !isValidStatusVitals(status.vitals)) {
                delete status.vitals;
                narrowed.push("status.vitals");
            }
            if (status.context !== undefined && !isValidStatusContext(status.context)) {
                delete status.context;
                narrowed.push("status.context");
            }
            if (status.limits !== undefined && !isValidLimitsArray(status.limits)) {
                delete status.limits;
                narrowed.push("status.limits");
            }
            if (
                status.extras !== undefined &&
                !(Array.isArray(status.extras) && status.extras.every((x) => typeof x === "string"))
            ) {
                delete status.extras;
                narrowed.push("status.extras");
            }
            out.status = status;
        }
    }
    if (out.activity !== undefined && !isValidActivity(out.activity)) {
        delete out.activity;
        narrowed.push("activity");
    }
    if (out.tool_stream !== undefined && !isValidToolStream(out.tool_stream)) {
        delete out.tool_stream;
        narrowed.push("tool_stream");
    }

    return {
        ok: true,
        frame: out as unknown as JournalEphemeralFrame,
        narrowed: narrowed.length > 0 ? narrowed : undefined,
    };
}

/**
 * Decode a parsed WebSocket message into a ServerFrame. Returns `{ ok: false, reason }` for a
 * frame that must be dropped (non-object, unknown discriminant, control frame without `op`,
 * unreadable box_status), or `{ ok: true, frame, narrowed? }` where `narrowed` lists any ephemeral
 * sub-shapes stripped as invalid. Journal events pass through unvalidated (see above); rpc frames
 * too, since the connection already validates them and rejecting one here would strand its
 * pending request until timeout.
 */
export function decodeServerFrame(raw: unknown): FrameDecodeResult {
    if (!isObject(raw)) return { ok: false, reason: "not_object" };
    switch (raw.kind) {
        case "journal":
            return { ok: true, frame: raw as unknown as JournalEvent };
        case "control":
            return decodeControl(raw);
        case "rpc":
            return { ok: true, frame: raw as unknown as JournalRpcFrame };
        case "ephemeral":
            return decodeEphemeral(raw);
        case "box_status":
            if (!parseBoxStatus(raw) || typeof raw.device_id !== "number")
                return { ok: false, reason: "bad_box_status" };
            return { ok: true, frame: raw as unknown as ServerFrame };
        // Fan-out frames for client sockets (never sequenced, never replayed): each consumer
        // validates its own payload.
        case "device_meta":
        case "briefing":
        case "defaults":
        case "box_defaults":
        case "pins":
        case "archive":
            return { ok: true, frame: raw as unknown as ServerFrame };
        default:
            return { ok: false, reason: "unknown_kind" };
    }
}
