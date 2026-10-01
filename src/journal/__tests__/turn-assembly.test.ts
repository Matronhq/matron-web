/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import {
    assembleTurns,
    bridgeTextKind,
    bridgeEventKind,
    eventToStep,
    isInjectedTurnStart,
    noticeBody,
    shownReplies,
    threadRows,
} from "../turn-assembly";
import { groupRowText, groupTurn, stepsOf } from "../turn-grouping";
import { type JournalEvent } from "../types";

let seq = 0;
const T0 = 1_790_000_000_000;
function ev(type: string, payload: Record<string, unknown>, o: Partial<JournalEvent> = {}): JournalEvent {
    seq += 1;
    return { seq, convo_id: "c1", ts: T0 + seq * 1000, sender: "agent:box", type, payload, ...o };
}
const user = (body: string): JournalEvent => ev("text", { body }, { sender: "user:op" });
const say = (body: string): JournalEvent => ev("text", { body, from: "assistant" });
const cmd = (command: string, exit_code: number | null = 0): JournalEvent =>
    ev("tool_output", { command, exit_code, snippet: "" });
const diff = (path: string, added = 1, removed = 0, tool = "Edit"): JournalEvent =>
    ev("diff", { tool, display_path: path, file_path: `/repo/${path}`, added, removed, diff: "" });

beforeEach(() => {
    seq = 0;
});

describe("assembleTurns", () => {
    it("splits on operator messages and separates narration from the answer", () => {
        const events = [
            user("why is the sheet cryptic?"),
            say("Let me read the sheet component first."),
            cmd("cat src/journal/components.tsx"),
            cmd("git log --oneline -8"),
            say("Found it; fixing the labels."),
            diff("src/journal/components.tsx", 18, 6),
            cmd("pnpm tsc --noEmit", 2),
            cmd("pnpm tsc --noEmit", 0),
            say("The sheet reads as cryptic for two reasons."),
            say("Tests pass and the type check is clean."),
            user("thanks"),
            say("Any time."),
        ];
        const turns = assembleTurns(events);
        expect(turns).toHaveLength(2);
        const [first, second] = turns;
        expect(first.operator?.payload.body).toBe("why is the sheet cryptic?");
        expect(first.items.map((item) => (item.kind === "narration" ? `“${item.text}”` : item.id))).toEqual([
            "“Let me read the sheet component first.”",
            "e3",
            "e4",
            "“Found it; fixing the labels.”",
            "e6",
            "e7",
            "e8",
        ]);
        expect(first.answer.map((event) => event.payload.body)).toEqual([
            "The sheet reads as cryptic for two reasons.",
            "Tests pass and the type check is clean.",
        ]);
        expect(
            groupTurn(first.items).flatMap((entry) => (entry.type === "group" ? [groupRowText(entry)] : [])),
        ).toEqual([
            "Read components.tsx",
            "Checked the history",
            "Changed 1 file",
            "Checked the types: failed once, then passed",
        ]);
        // Duration runs from the operator message.
        expect(first.endTs - first.startTs).toBe(9000);
        // A turn with no steps has no card content; its text is all answer.
        expect(second.items).toEqual([]);
        expect(second.answer.map((event) => event.payload.body)).toEqual(["Any time."]);
    });

    it("keeps break-throughs, notices and errors out of the card", () => {
        const events = [
            user("ship it"),
            cmd("pnpm vitest run", 1),
            ev("permission_request", { question: "Allow: push?" }),
            ev("image", { blob_ref: "img1" }),
            say("🗜️ Context compacted — conversation history was summarized to free up space"),
            say("[Session ended (exit 1)]"),
        ];
        const [turn] = assembleTurns(events);
        expect(stepsOf(turn.items)).toHaveLength(1);
        expect(turn.breaks.map((event) => event.type)).toEqual(["permission_request", "image"]);
        expect(turn.notices).toHaveLength(1);
        expect(turn.errors.map((event) => event.payload.body)).toEqual(["[Session ended (exit 1)]"]);
        expect(turn.answer).toEqual([]);
        expect(threadRows([turn]).map((row) => row.kind)).toEqual(["operator", "turn", "notice"]);
    });

    it("keeps an answer to the agent's question inside the same turn", () => {
        const events = [
            user("push it when green"),
            cmd("pnpm vitest run"),
            ev("prompt", { question: "Open a PR as well?", options: ["Open PR", "Not yet"] }),
            ev("prompt_reply", { target_seq: 3, choice: "Open PR" }, { sender: "user:op" }),
            cmd("gh pr create --fill"),
            say("Opened the PR."),
        ];
        const turns = assembleTurns(events);
        expect(turns).toHaveLength(1);
        const [turn] = turns;
        expect(stepsOf(turn.items)).toHaveLength(2);
        expect(turn.replies.map((event) => event.type)).toEqual(["prompt_reply"]);
        expect(turn.breaks.map((event) => event.type)).toEqual(["prompt"]);
        expect(turn.answer.map((event) => event.payload.body)).toEqual(["Opened the PR."]);
    });

    it("treats agent events before the first operator message as their own turn", () => {
        const [turn] = assembleTurns([say("Session started."), cmd("ls")]);
        expect(turn.operator).toBeUndefined();
        expect(turn.items.map((item) => item.kind)).toEqual(["narration", "step"]);
    });

    it("omits the agent tile when a turn holds only notices", () => {
        const rows = threadRows(assembleTurns([user("/restart --browser"), say("🔄 Restarting Claude session...")]));
        expect(rows.map((row) => row.kind)).toEqual(["operator", "notice"]);
    });

    it("omits the agent tile when a turn holds only a picked-option reply", () => {
        // The question arrives in one turn; the operator answers it after sending a new message.
        const events = [
            user("push it when green"),
            ev("prompt", { question: "Open a PR as well?", options: ["Open PR", "Not yet"] }),
            user("also bump the version"),
            ev("prompt_reply", { target_seq: 2, choice: "Open PR" }, { sender: "user:op" }),
        ];
        const turns = assembleTurns(events);
        expect(turns[1].replies).toHaveLength(1);
        expect(shownReplies(turns[1])).toEqual([]);
        expect(threadRows(turns).map((row) => row.kind)).toEqual(["operator", "turn", "operator"]);
    });

    it("shows a free-text reply as an operator row when the turn holds nothing else", () => {
        const events = [
            user("push it when green"),
            ev("prompt", { question: "Which branch?", allows_free_text: true }),
            user("also bump the version"),
            ev("prompt_reply", { target_seq: 2, text: "release/2.1" }, { sender: "user:op" }),
        ];
        const turns = assembleTurns(events);
        expect(shownReplies(turns[1])).toEqual([]);
        const rows = threadRows(turns);
        expect(rows.map((row) => row.kind)).toEqual(["operator", "turn", "operator", "operator"]);
        expect(rows[3].kind === "operator" && rows[3].event.payload.text).toBe("release/2.1");
    });

    it("keeps a free-text reply in the agent tile once the agent answers", () => {
        const events = [
            user("push it when green"),
            ev("prompt", { question: "Which branch?", allows_free_text: true }),
            user("also bump the version"),
            ev("prompt_reply", { target_seq: 2, text: "release/2.1" }, { sender: "user:op" }),
            say("Bumped it on release/2.1."),
        ];
        const turns = assembleTurns(events);
        expect(shownReplies(turns[1]).map((event) => event.payload.text)).toEqual(["release/2.1"]);
        expect(threadRows(turns).map((row) => row.kind)).toEqual(["operator", "turn", "operator", "turn"]);
    });

    it("starts a turn the bridge injected at its line, shown as a notice above the tile", () => {
        const events = [
            user("why is CI red?"),
            cmd("gh run view"),
            say("A flaky test; rerun it."),
            ev("text", { body: "🔔 Routine morning-sweep: Morning sweep", from: "assistant" }, { ts: T0 + 86_400_000 }),
            ev("tool_output", { command: "gh pr list", exit_code: 0 }, { ts: T0 + 86_401_000 }),
            ev("text", { body: "Two PRs need you.", from: "assistant" }, { ts: T0 + 86_402_000 }),
        ];
        const turns = assembleTurns(events);
        expect(turns).toHaveLength(2);
        expect(turns[0].answer.map((event) => event.payload.body)).toEqual(["A flaky test; rerun it."]);
        const [, routine] = turns;
        expect(routine.operator).toBeUndefined();
        expect(routine.opener?.payload.body).toBe("🔔 Routine morning-sweep: Morning sweep");
        expect(routine.events.map((event) => event.type)).toEqual(["tool_output", "text"]);
        // The duration runs from the routine's line, not from yesterday's message.
        expect(routine.endTs - routine.startTs).toBe(2000);
        expect(threadRows(turns).map((row) => row.kind)).toEqual(["operator", "turn", "notice", "turn"]);
    });

    it("keeps a control line parked until the turn ends inside the running turn", () => {
        const events = [
            user("ship it"),
            cmd("pnpm test"),
            say("🔔 Routine morning-sweep: Morning sweep once this turn finishes"),
            cmd("git push"),
            say("Pushed."),
        ];
        const [turn, ...rest] = assembleTurns(events);
        expect(rest).toEqual([]);
        expect(stepsOf(turn.items)).toHaveLength(2);
        expect(turn.notices).toHaveLength(1);
    });

    it("opens a turn on text the bridge mirrors for the user (a self-restart's carry-on)", () => {
        const events = [
            say("🔄 Restarting this session with browser tools now. It will carry on by itself (self-restart 1/3)."),
            say("Claude Code session restarted.\nSession: 1234abcd...\nWorkdir: /repo"),
            ev("text", { body: "Take the screenshot of the turn card now.", from: "user" }),
            cmd("node shoot.js"),
        ];
        const turns = assembleTurns(events);
        expect(turns).toHaveLength(2);
        expect(turns[0].notices).toHaveLength(2);
        expect(turns[1].opener?.payload.body).toBe("Take the screenshot of the turn card now.");
        expect(stepsOf(turns[1].items)).toHaveLength(1);
    });

    it("keeps markers the journal writes under the user's name inside the turn", () => {
        const events = [
            user("tidy the routines"),
            cmd("routine_list"),
            ev("routine", { action: "saved", name: "morning-sweep" }, { sender: "user:op" }),
            ev("memory", { action: "saved", name: "no-worktrees" }, { sender: "user:op" }),
            cmd("routine_update"),
            say("Done."),
        ];
        const turns = assembleTurns(events);
        expect(turns).toHaveLength(1);
        expect(stepsOf(turns[0].items)).toHaveLength(2);
        expect(turns[0].breaks.map((event) => event.type)).toEqual(["memory"]);
        expect(turns[0].notices.map((event) => event.type)).toEqual(["routine"]);
        expect(turns[0].answer.map((event) => event.payload.body)).toEqual(["Done."]);
        // An item reply is the operator speaking: the bridge turns it into a turn.
        const reply = ev("item", { action: "commented", item_id: "it_1", num: 4 }, { sender: "user:op" });
        expect(assembleTurns([...events, reply, say("On it.")])).toHaveLength(2);
    });

    it("gives each agent in a room its own tile", () => {
        const alpha = (body: string): JournalEvent => ev("text", { body, from: "agent" }, { sender: "agent:alpha" });
        const beta = (body: string): JournalEvent => ev("text", { body, from: "agent" }, { sender: "agent:beta" });
        const turns = assembleTurns([
            alpha("Can you rebase?"),
            beta("Rebased."),
            beta("CI is green."),
            alpha("Thanks."),
        ]);
        expect(turns.map((turn) => turn.events.map((event) => event.sender))).toEqual([
            ["agent:alpha"],
            ["agent:beta", "agent:beta"],
            ["agent:alpha"],
        ]);
    });
});

describe("eventToStep", () => {
    it("maps a Claude Bash tool_output to a shell step with its exit status", () => {
        expect(eventToStep(cmd("pnpm tsc --noEmit", 2))).toMatchObject({
            tool: "Bash",
            input: { command: "pnpm tsc --noEmit" },
            status: "failed",
            exit: 2,
        });
        expect(eventToStep(cmd("sleep 999", null))).toMatchObject({ status: "stopped", exit: null });
        expect(eventToStep(ev("tool_output", { command: "rm -rf x", denied: true }))).toMatchObject({
            status: "failed",
        });
    });

    it("maps Codex apply_patch diffs and legacy file_change output to change steps", () => {
        expect(eventToStep(diff("src/a.ts", 3, 1, "apply_patch"))).toMatchObject({
            tool: "apply_patch",
            input: { path: "src/a.ts" },
            added: 3,
            removed: 1,
        });
        expect(eventToStep(ev("tool_output", { command: "file_change", output: "update src/a.ts" }))).toMatchObject({
            tool: "file_change",
        });
        expect(eventToStep(ev("tool_output", { command: "pnpm test", status: "failed" }))).toMatchObject({
            status: "failed",
        });
    });

    it("maps a Codex generic completed item line to a step", () => {
        expect(eventToStep(say("`Web search`"))).toMatchObject({ tool: "WebSearch" });
        expect(eventToStep(say("`Mcp tool call`"))).toMatchObject({ tool: "Mcp tool call" });
        expect(eventToStep(say("`not a step` with prose"))).toBeNull();
        // Only the agent's own lines: an operator reply that is just a code span stays a message.
        expect(eventToStep(user("`Done`"))).toBeNull();
    });

    it("approximates duration from the previous event", () => {
        const step = eventToStep({ ...cmd("pnpm build"), ts: T0 + 5000 }, T0 + 2000);
        expect(step?.ms).toBe(3000);
    });
});

// Payload shapes copied from the bridge producers (matron-bridge): Claude's
// finalizeToolStreamEntry, the Codex exec formatter (command_execution / file_change), the Codex
// app-server finalize, and buildEditDiffPayload / publishChanges for diffs.
describe("bridge producer payloads", () => {
    it("reads a Claude Bash finalize", () => {
        const step = eventToStep(
            ev("tool_output", {
                message_ref: "toolu_1",
                command: "pnpm tsc --noEmit",
                exit_code: 2,
                denied: false,
                truncated: false,
                snippet: "error TS2322",
                blob_ref: "m1",
                live_log: true,
            }),
        );
        expect(step).toMatchObject({
            tool: "Bash",
            status: "failed",
            exit: 2,
            input: { command: "pnpm tsc --noEmit" },
        });
    });

    it("reads a Codex exec command_execution and file_change", () => {
        expect(
            eventToStep(
                ev("tool_output", {
                    tool_use_id: "item_1",
                    command: "bash -lc 'pnpm vitest run'",
                    output: "ok",
                    exit_code: 0,
                    status: "completed",
                }),
            ),
        ).toMatchObject({ tool: "Bash", status: "ok", exit: 0 });
        expect(
            eventToStep(
                ev("tool_output", {
                    tool_use_id: "item_2",
                    command: "file_change",
                    output: "update src/a.ts",
                    status: "completed",
                }),
            ),
        ).toMatchObject({ tool: "file_change", status: "ok", exit: undefined });
    });

    it("reads a Claude Edit diff and a Codex apply_patch diff", () => {
        const claude = eventToStep(
            ev("diff", {
                file_path: "/repo/src/a.ts",
                display_path: "src/a.ts",
                viewer_url: null,
                tool: "Write",
                label: null,
                diff: "+x",
                added: 1,
                removed: 0,
                truncated: false,
                new_file: true,
                from: "assistant",
            }),
        );
        expect(claude).toMatchObject({ tool: "Write", input: { path: "src/a.ts" }, newFile: true, added: 1 });
        const codex = eventToStep(
            ev("diff", {
                file_path: "/repo/src/b.ts",
                display_path: "src/b.ts",
                viewer_url: null,
                tool: "apply_patch",
                label: null,
                diff: "-a\n+b",
                from: "assistant",
                added: 1,
                removed: 1,
                truncated: false,
                new_file: false,
            }),
        );
        expect(codex).toMatchObject({ tool: "apply_patch", newFile: false, removed: 1 });
    });
});

// Every string below is the bridge's own wording (matron-bridge master), not a paraphrase.
describe("bridgeTextKind", () => {
    it.each([
        "🗜️ Context compacted — conversation history was summarized to free up space",
        "✅ Context compacted — conversation history summarized.",
        "✅ Compacted — context now 3.7k/1m",
        "⏳ Session was idle — auto-resuming it now. Your message will be delivered as soon as it's ready.",
        "⏳ A restart is pending for this session — queued messages go to the restarted session instead.",
        "⏳ This session was asleep — waking it to deliver a message from an agent chat room.",
        "⏳ Queued — this chat is mid-turn. It will be delivered when the turn ends.",
        '⏳ Still working — `Bash` has been running for 5m. Tap Stop (or send "interrupt") to cancel if it seems stuck.',
        '⏳ `Bash` is STILL running (15m). If it seems stuck, tap Stop (or send "interrupt") to cancel it.',
        "⚡ Sending 1 queued message",
        "📬 Sending 2 queued messages:",
        "🔄 Restarting Claude session...",
        "🔄 Restarting this session with browser tools now. It will carry on by itself (self-restart 1/3).",
        "Claude Code session restarted.\nSession: 1234abcd...\nWorkdir: /repo\nExtras: browser",
        "Codex session restarted.\nSession: (new)\nWorkdir: /repo",
        "[Session crashed (exit 1), restarted automatically — attempt 2/3]",
        "Waiting for turn to finish before restarting. Send again with --force to restart immediately.",
        "[Session ended (exit 0)]",
        "⚠️ Couldn't deliver 2 queued messages to this chat — they're still in the room, and the agent can re-read them with agent_chat_read.",
        "🔇 Not delivered — this chat is muted.",
        "🛠 Coordinator (mavis): compacting this session — context at 92%",
        "🛠 Coordinator: carry on: “finish the PR” once this turn finishes",
        "🛠 The model this session was on is no longer available — switched to the default model; carrying on once the switch has settled.",
        "🔔 Routine morning-sweep: Morning sweep once this turn finishes",
        "⚠️ Coordinator: compacting this session — refused: the session has ended",
        "⚠️ Routine morning-sweep: Morning sweep — refused: forbidden",
        "⚠️ Alertmanager alert: DiskFull on services-1 — refused: forbidden",
        "✅ Session compact on mavis applied.",
        "⏳ Session carry-on on mavis parked: the session is busy; it applies at its next idle point.",
        "⏰ Session carry-on on mavis scheduled for 15:00 UTC.",
        "⚠️ Session model switch on mavis failed: timeout (the bridge did not answer; the box may be starting)",
        '⏰ Timer #3 set — will send "check CI" in 30m (at 14:30). ',
        "⏰ The agent set itself reminder #4 — in 2h (at 16:00).",
    ])("recognises the notice %#", (body) => {
        expect(bridgeTextKind(body)).toBe("notice");
    });

    it.each([
        "[Session ended (exit 1)]",
        "[Session ended (exit 137)]",
        "⚠️ That conversation can no longer be found or resumed.",
        "⚠️ Could not deliver your message: session closed",
        "⚠️ Couldn't deliver your queued message — the session ended before it was sent.",
        "⚠️ Couldn't deliver 3 queued messages — the session ended before they were sent.",
    ])("recognises the turn-ending error %#", (body) => {
        expect(bridgeTextKind(body)).toBe("error");
    });

    it("leaves agent prose alone", () => {
        expect(bridgeTextKind("Restarting the dev server now.")).toBeNull();
        expect(bridgeTextKind("The session couldn't be simpler.")).toBeNull();
        expect(bridgeTextKind("")).toBeNull();
    });
});

describe("isInjectedTurnStart", () => {
    it.each([
        "🔔 Routine morning-sweep: Morning sweep",
        "🔔 Routines morning-sweep, evening-sweep (now that the session is free)",
        "🔔 Alertmanager: DiskFull on services-1",
        "🔔 3 important things have gone unseen by the user for over 2 hours:\n- #12 …",
        "🛠 Coordinator (mavis): carry on: “finish the PR” — usage limit reset",
        "🕒 The usage limit has reset — carrying on automatically.",
        "🕒 The usage limit has reset — sending the Coordinator's carry-on now.",
        '⏰ Reminder #4 (set by the agent): "check the deploy"',
        '⏰ Timer #2: sending "run the tests"',
        "🤝 A consent request is waiting for the user: \n- spawn sp_1 …",
        '🤝 beta requests a chat with this session about "PR 39"',
        '💬 beta in "alpha ↔️ beta — PR 39": can you rebase?',
        "📨 Delivered 2 queued messages.",
        '🚀 Spawn sp_12: "fix the tests" — session started on the target box, detached — it was seeded with your task.',
    ])("opens a turn at %s", (body) => {
        expect(isInjectedTurnStart(say(body))).toBe(true);
        // Still a bridge line, never the agent's prose.
        expect(bridgeTextKind(body)).toBe("notice");
    });

    it.each([
        "🔔 Routine morning-sweep: Morning sweep once this turn finishes",
        "🛠 Coordinator: carry on: “finish the PR” once this turn finishes — usage limit",
        "🛠 Coordinator: carry on once the usage limit resets at 15:00 UTC: “finish the PR”",
        "🛠 Coordinator: compacting this session",
        "⏰ The agent set itself reminder #4 — in 2h (at 16:00).",
        "⚡ Quick summary: all green.",
    ])("opens nothing at %s", (body) => {
        expect(isInjectedTurnStart(say(body))).toBe(false);
    });

    it("never takes an operator message or a room message for a bridge line", () => {
        expect(isInjectedTurnStart(user("🔔 Routine morning-sweep: Morning sweep"))).toBe(false);
        expect(isInjectedTurnStart(ev("text", { body: "Rebased.", from: "agent" }))).toBe(false);
    });
});

describe("the bridge's structured flags", () => {
    it("reads payload.notice before the wording, and tolerates kinds it does not know", () => {
        const flagged = (body: string, notice: string): JournalEvent => ev("text", { body, from: "assistant", notice });
        expect(bridgeEventKind(flagged("Anything at all", "compaction"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "crash_restart"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "slow_tool"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "a_kind_from_the_future"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "constructor"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "__proto__"))).toBe("notice");
        expect(bridgeEventKind(flagged("Anything at all", "delivery_failed"))).toBe("error");
        // Absent: the wording decides, as before.
        expect(bridgeEventKind(say("Claude Code session restarted."))).toBe("notice");
        expect(bridgeEventKind(say("Plain prose."))).toBeNull();
        // Never on the operator's own text.
        expect(bridgeEventKind(ev("text", { body: "x", notice: "control" }, { sender: "user:op" }))).toBeNull();
    });

    it("keeps a flagged notice out of the card and the answer", () => {
        const [turn] = assembleTurns([
            user("go"),
            cmd("ls"),
            ev("text", { body: "Context squeezed.", from: "assistant", notice: "compaction" }),
            say("Done."),
        ]);
        expect(turn.notices.map((event) => event.payload.body)).toEqual(["Context squeezed."]);
        expect(turn.answer.map((event) => event.payload.body)).toEqual(["Done."]);
    });

    it("opens a turn on payload.turn_start whatever the line says, and on any event type", () => {
        const before = [user("deploy it"), cmd("pnpm build"), say("Deployed.")];
        const line = ev("text", {
            body: "A wording the client has never seen",
            from: "assistant",
            notice: "control",
            turn_start: { origin: "a_new_origin" },
        });
        expect(isInjectedTurnStart(line)).toBe(true);
        const turns = assembleTurns([...before, line, cmd("ls")]);
        expect(turns).toHaveLength(2);
        expect(turns[1].opener).toBe(line);
        expect(stepsOf(turns[1].items)).toHaveLength(1);

        // On a step or the agent's own words, the turn opens there and the event stays content.
        const step = ev("tool_output", { command: "ls", exit_code: 0, turn_start: { origin: "routine" } });
        const stepTurns = assembleTurns([...before, step]);
        expect(stepTurns).toHaveLength(2);
        expect(stepTurns[1].opener).toBeUndefined();
        expect(stepsOf(stepTurns[1].items)).toHaveLength(1);
        const words = ev("text", {
            body: "Morning. Two PRs need you.",
            from: "assistant",
            turn_start: { origin: "routine" },
        });
        const wordTurns = assembleTurns([...before, words]);
        expect(wordTurns).toHaveLength(2);
        expect(wordTurns[1].answer).toEqual([words]);
    });

    it("never takes payload.turn_start on the operator's own event as a bridge line", () => {
        expect(
            isInjectedTurnStart(ev("text", { body: "hi", turn_start: { origin: "peer" } }, { sender: "user:op" })),
        ).toBe(false);
    });
});

describe("journal markers in the turn view", () => {
    it("keeps summary and Coordinator role markers out of the tile", () => {
        const [turn] = assembleTurns([
            user("go"),
            cmd("ls"),
            ev("summary", { text: "a summary" }),
            ev("coordinator", { role: "assigned" }, { sender: "journal" }),
            say("Done."),
        ]);
        expect(turn.breaks).toEqual([]);
        expect(turn.notices).toEqual([]);
    });

    it("shows routine and consent markers as one compact line each", () => {
        const saved = ev(
            "routine",
            { routine_id: "r1", name: "morning", action: "saved", created: true },
            { sender: "user:op" },
        );
        const deleted = ev("routine", { routine_id: "r1", name: "morning", action: "deleted" }, { sender: "user:op" });
        const fired = ev("routine", { routine_id: "r1", name: "morning", action: "fired" }, { sender: "journal" });
        const consent = ev(
            "consent_decision",
            { kind: "spawn", decision: "approve", by: "coordinator", reason: "fits the rules" },
            { sender: "journal" },
        );
        const [turn] = assembleTurns([user("go"), cmd("ls"), saved, deleted, fired, consent, say("Done.")]);
        expect(turn.breaks).toEqual([]);
        // No bridge line announces this fire, so its marker stays visible.
        expect(turn.notices).toEqual([saved, deleted, fired, consent]);
        expect(noticeBody(saved)).toBe("Routine “morning” created");
        expect(noticeBody(deleted)).toBe("Routine “morning” deleted");
        expect(noticeBody(consent)).toBe("The Coordinator approved this request: fits the rules");
        // The journal's values (CONSENT_DECISIONS): approve | decline. Anything else claims neither.
        expect(noticeBody(ev("consent_decision", { decision: "decline" }))).toBe(
            "The Coordinator declined this request",
        );
        expect(noticeBody(ev("consent_decision", {}))).toBe("The Coordinator answered this request");
    });

    it("shows a Coordinator role change the operator made as a compact line, not a raw bubble", () => {
        const role = ev("coordinator", { role: "assigned" }, { sender: "user:op" });
        const turns = assembleTurns([user("hi"), say("Hello."), role, say("I'm the Coordinator now.")]);
        expect(turns).toHaveLength(2);
        const rows = threadRows(turns);
        expect(rows.map((row) => row.kind)).toEqual(["operator", "turn", "notice", "turn"]);
        expect(noticeBody(role)).toBe("This conversation is now the Coordinator");
        expect(noticeBody(ev("coordinator", { role: "released" }))).toBe(
            "This conversation is no longer the Coordinator",
        );
        expect(noticeBody(ev("coordinator", {}))).toBe("The Coordinator role changed");
    });
});

describe("a routine's fire marker", () => {
    const fired = (): JournalEvent =>
        ev("routine", { routine_id: "r1", name: "morning", action: "fired" }, { sender: "journal" });

    it("is hidden when the bridge's own line for that routine follows", () => {
        const marker = fired();
        const turns = assembleTurns([
            user("go"),
            say("Done."),
            marker,
            say("🔔 Routine morning: Morning brief"),
            cmd("ls"),
        ]);
        expect(turns.flatMap((turn) => turn.notices)).not.toContain(marker);
        expect(turns[1].opener?.payload.body).toBe("🔔 Routine morning: Morning brief");
    });

    it("stays visible as a compact line when no bridge line announces it", () => {
        const marker = fired();
        const [turn] = assembleTurns([user("go"), say("Done."), marker]);
        expect(turn.notices).toEqual([marker]);
        expect(noticeBody(marker)).toBe("Routine “morning” fired");
    });
});
