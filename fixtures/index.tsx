/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Visual-fidelity fixture entry — NOT shipped. Mounts the REAL MatronApp with a fake
 * signed-in client (mirrors test/unit-tests/journal/components-test.ts `signedInClient`)
 * so the Playwright driver in scripts/visual/ can screenshot real components — real
 * icons, real layout, real CSS pipeline (this builds through the app's own postcss-loader
 * via webpack.fixtures.mjs) — in every state, both themes, without a login or live server.
 *
 * Playwright reaches the client via window.__matron to drive states (stage a file →
 * upload modal, etc.). Theme comes from ?theme=dark on <html data-theme>.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/fira-code/latin-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";

import { archiveStore, favoriteStore, MatronJournalClient, pinnedStore, unreadStore } from "../src/journal/client";
import { MatronApp } from "../src/journal/components";
import type { ClientState, Conversation, JournalEvent, Session } from "../src/journal/types";
import "../src/journal/shell.pcss";
import "../src/journal/journal.pcss";
import "../src/journal/tracker.pcss";

const SESSION: Session = {
    serverUrl: "https://journal.example",
    token: "fixture",
    deviceId: 1,
    userId: 2,
    username: "operator@example.com",
};

const conversations: Conversation[] = [
    {
        id: "c1",
        title: "🐣 [dc] matron-web · deploy",
        agent_device_id: 1,
        session_state: "running",
        last_seq: 6,
        unread_count: 0,
        snippet: "Restarted nginx; error rate steady at 0.02%",
        created_at: 1,
        read_up_to_seq: 6,
    },
    {
        id: "c2",
        title: "🐣 [b2] infra: backup rotation",
        agent_device_id: 2,
        session_state: "idle",
        last_seq: 3,
        unread_count: 3,
        snippet: "Cron entry added for 03:15 UTC daily",
        created_at: 1,
        read_up_to_seq: 0,
    },
    {
        id: "c3",
        title: "🐣 [e9] postgres upgrade dry-run",
        agent_device_id: 2,
        session_state: "idle",
        last_seq: 2,
        unread_count: 0,
        snippet: "pg_upgrade finished · 0 errors",
        created_at: 1,
        read_up_to_seq: 2,
    },
    // Subagents of the selected conversation (c1) — drive the header SUBAGENTS strip.
    {
        id: "s1",
        title: "🐣 [7a] test triage",
        agent_device_id: 1,
        session_state: "running",
        last_seq: 4,
        unread_count: 0,
        snippet: "32 tests fixed, 1 quarantined",
        created_at: 1,
        parent_convo_id: "c1",
        read_up_to_seq: 4,
    },
    {
        id: "s2",
        title: "docs sweep",
        session_state: "done",
        last_seq: 2,
        unread_count: 0,
        snippet: "swept 14 files",
        created_at: 1,
        parent_convo_id: "c1",
        read_up_to_seq: 2,
    },
];

// A representative thread that exercises EVERY content renderer so the harness shows the
// real shapes/fonts/bubbles: fenced code, plain markdown, exec tool_output card, doc-edit
// diff card, permission card, agent-spawn card + its resolved spawn_outcome row, and own
// (user) bubbles. ts is epoch-seconds.
const T = 1_782_000_000;
const DAY_MS = 86_400_000;
const events: JournalEvent[] = [
    {
        // A prior-calendar-day event so the timeline renders TWO date dividers (one before this
        // opening turn, one when the day rolls over to the main T-day thread below).
        seq: 0,
        convo_id: "c1",
        ts: T - DAY_MS - 3600,
        sender: "user:operator",
        type: "text",
        payload: { body: "kicking this off — reskin the journal client end to end" },
    },
    {
        seq: 1,
        convo_id: "c1",
        ts: T,
        sender: "agent:claude",
        type: "text",
        payload: {
            body: "```nginx\nlocation /journal/ {\n    proxy_pass http://127.0.0.1:9810/;\n    proxy_read_timeout 3600s;  # websocket frames\n}\n```",
        },
    },
    {
        seq: 2,
        convo_id: "c1",
        ts: T + 60,
        sender: "agent:claude",
        type: "text",
        payload: { body: "To swap prod I need to restart nginx." },
    },
    {
        seq: 3,
        convo_id: "c1",
        ts: T + 120,
        sender: "agent:claude",
        type: "permission_request",
        payload: {
            description: "Run `systemctl restart nginx` on prod?",
            question: "Run `systemctl restart nginx` on prod?",
            options: ["Allow", "Always allow", "Deny"],
        },
    },
    { seq: 4, convo_id: "c1", ts: T + 180, sender: "user:operator", type: "text", payload: { body: "yes" } },
    {
        seq: 5,
        convo_id: "c1",
        ts: T + 240,
        sender: "user:operator",
        type: "text",
        payload: { body: "and watch the error rate for 10 minutes after" },
    },
    {
        seq: 6,
        convo_id: "c1",
        ts: T + 300,
        sender: "agent:claude",
        type: "tool_output",
        payload: {
            command: "systemctl restart nginx && systemctl status nginx",
            exit_code: 0,
            snippet:
                "● nginx.service - A high performance web server\n     Active: active (running) since Fri 10:06:02 UTC\n     Process: 24518 ExecReload (code=exited, status=0/SUCCESS)",
        },
    },
    {
        seq: 7,
        convo_id: "c1",
        ts: T + 360,
        sender: "agent:claude",
        type: "diff",
        payload: {
            tool: "Edit",
            file_path: "nginx/conf.d/journal.conf",
            added: 2,
            removed: 1,
            diff: "@@ -1,3 +1,4 @@\n location /journal/ {\n     proxy_pass http://127.0.0.1:9810/;\n-    proxy_read_timeout 60s;\n+    proxy_read_timeout 3600s;\n+    proxy_buffering off;\n }",
        },
    },
    {
        seq: 8,
        convo_id: "c1",
        ts: T + 420,
        sender: "agent:claude",
        type: "text",
        payload: {
            body: "Restarted. Error rate steady at **0.02%** over the last 10 minutes — dashboards clean, websocket reconnects normal.\n\n```nginx\nlocation /journal/ {\n    proxy_pass http://127.0.0.1:9810/;\n    proxy_read_timeout 3600s;\n}\n```\n\nBackups rotated: oldest three pruned, latest verified with a test restore. Kept [webapp.bak.20260724T100212Z](https://example.test/bak) as the rollback point.",
        },
    },
    {
        // Unrecognised event type → diagnostic .mj_Unknown card (dashed border on raised).
        seq: 9,
        convo_id: "c1",
        ts: T + 480,
        sender: "agent:claude",
        type: "telemetry_snapshot",
        payload: { cpu: 0.42, mem: "1.8GB", note: "unrecognised event → diagnostic card, never hidden" },
    },
    // A user message so the prompt below starts a NEW section (first-in-section) — this is
    // the case where a duplicate timestamp (profile row + card header) would show if the
    // card didn't own its timestamp.
    { seq: 10, convo_id: "c1", ts: T + 520, sender: "user:operator", type: "text", payload: { body: "go ahead" } },
    {
        // Question card — UNANSWERED (label+time / gutter mail icon + body / Send now·Cancel).
        seq: 11,
        convo_id: "c1",
        ts: T + 540,
        sender: "agent:claude",
        type: "prompt",
        payload: {
            question: "Queued (1) — send these now, or cancel and keep editing?",
            options: ["Send now", "Cancel"],
        },
    },
    {
        // Question card — ANSWERED (green check + resolution line); seq 13 reply resolves it.
        seq: 12,
        convo_id: "c1",
        ts: T + 600,
        sender: "agent:claude",
        type: "prompt",
        payload: { question: "Which environment should I deploy to?", options: ["Staging", "Production"] },
    },
    {
        seq: 13,
        convo_id: "c1",
        ts: T + 660,
        sender: "user:operator",
        type: "prompt_reply",
        payload: { target_seq: 12, choice: "Staging" },
    },
    {
        // Agent-spawn consent card, resolved (see seq 15's spawn_outcome below) — Started +
        // Open chrome. room_id points at s1, an existing fixture conversation, so the Open
        // button is a genuine navigable target in the harness.
        seq: 14,
        convo_id: "c1",
        ts: T + 720,
        sender: "agent:claude",
        type: "permission_request",
        payload: {
            kind: "agent_spawn",
            request_id: "spawn-fixture-1",
            from_device_id: 1,
            from_name: "claude",
            from_convo_id: "c1",
            from_convo_title: "matron-web · deploy",
            target_device_id: 4,
            target_name: "elm",
            workdir: "/srv/app/web",
            task: "Chase down the flaky upload-timeout test and either fix it or quarantine it with a linked issue.",
            topic: "Flaky test triage",
        },
    },
    {
        // Durable resolution of the ask above. Renders twice: the card at seq 14 flips to its
        // resolved Started+Open state, and this event itself renders the standalone
        // spawn_outcome timeline row (for once the card has scrolled out of view).
        seq: 15,
        convo_id: "c1",
        ts: T + 780,
        sender: "journal",
        type: "spawn_outcome",
        payload: { request_id: "spawn-fixture-1", outcome: "started", room_id: "s1", child_convo_id: "s1" },
    },
];

const client = new MatronJournalClient();
const state: ClientState = {
    ...client.getSnapshot(),
    phase: "signed-in",
    session: SESSION,
    conversations,
    // Two boxes so the Mac-style box letters render ahead of titles.
    agents: [
        { device_id: 1, name: "ash", tag_char: null },
        { device_id: 2, name: "birch", tag_char: "B" },
    ],
    selectedConversationId: "c1",
    events,
    pendingMessages: [],
    connection: "online",
    sessionStatus: {
        model: "claude-sonnet",
        context: { tokens: 144_000, window: 200_000, pct: 72 },
        // id-driven limits (v5+ bridge): ctx is synthesized from context; the rest carry
        // stable ids → short tags 5h/fbl/wk/cpu/ram + column-first 3×2 grid order.
        limits: [
            { id: "week_all", label: "Week (all models)", percent: 63, resets: "4d" },
            { id: "session", label: "Session", percent: 41, resets: "3h20" },
            // host_ram: FRESH sample (10s old) → renders normally. host_cpu: STALE (4m old,
            // past HOST_VITALS_STALE_MS=60s) → renders dimmed with "last sampled 4m ago" in the
            // accessible name. Contact sheet shows the fresh vs stale host-vital states together.
            { id: "host_ram", label: "Host RAM", percent: 55, unit: "%", sampled_at_ms: Date.now() - 10_000 },
            { id: "week_fable", label: "Week (Fable)", percent: 22, resets: "4d" },
            { id: "host_cpu", label: "Host CPU", percent: 34, unit: "%", sampled_at_ms: Date.now() - 240_000 },
        ],
    },
    archivedIds: archiveStore.read(SESSION).ids,
    pinnedIds: pinnedStore.read(SESSION).ids,
    favoriteIds: favoriteStore.read(SESSION).ids,
    unreadOverrideIds: unreadStore.read(SESSION).ids,
};
// ?screen=login mounts the signed-out sign-in screen instead (unify step 2); ?fixed adds a
// config.json-style fixed server so the hidden-server-field variant can be shot too.
const fixtureParams = new URLSearchParams(window.location.search);
const signedOutState: ClientState = {
    ...client.getSnapshot(),
    phase: "signed-out",
    config: fixtureParams.has("fixed") ? { journal_server_url: "/" } : {},
};
// The client keeps its state private; mirror the test harness's internal override.
(client as unknown as { state: ClientState }).state = fixtureParams.get("screen") === "login" ? signedOutState : state;

// ?tracker=inbox | ?tracker=item opens the tracker pane on canned data (unify step 5); the
// network loads are stubbed so the fixture stays offline.
const trackerMode = fixtureParams.get("tracker");
if (trackerMode === "projects" || trackerMode === "project") {
    const now = Date.now();
    const project = (
        num: number,
        title: string,
        status: string | null,
        needs: number,
        running: number,
        ago: number,
    ) => ({
        id: `pj_${num}`,
        num,
        state: "open",
        title,
        body: "",
        status,
        status_by: "agent",
        status_updated_at: now - ago,
        created_at: now - 30 * 86_400_000,
        updated_at: now - ago,
        missions: { running, waiting: needs > 0 ? 1 : 0, idle: 1, quiet: 0, closed: 2 },
        needs_you: needs,
        open_items: needs + 3,
        last_activity_at: now - ago,
    });
    const projects = [
        project(
            2645,
            "Web/Mac design unification",
            "Phase 2 running: tokens merged and deploying; sign-in waits on your merge; sidebar, chat, tracker and settings are up for review.",
            1,
            1,
            6 * 60_000,
        ),
        project(
            2512,
            "Docs site launch",
            "On track for Wednesday morning. The branch is green; your approvals of the landing page and the changelog gate Sunday's checkpoint.",
            3,
            2,
            20 * 60_000,
        ),
        project(2301, "Billing export", null, 0, 0, 2 * 86_400_000),
    ];
    const mission = (num: number, title: string, status: string | null, activity: string, needs: number) => ({
        id: `ms_${num}`,
        num,
        state: "open",
        title,
        body: "",
        close_summary: null,
        closed_by: null,
        closed_over_open_items: 0,
        origin_convo_id: "c1",
        created_by: "agent",
        created_at: now - 86_400_000,
        updated_at: now,
        last_milestone_at: now,
        closed_at: null,
        open_items: 3,
        needs_you: needs,
        conversations: 1,
        milestones: 4,
        last_milestone: null,
        status,
        activity,
    });
    const stub = client as unknown as Record<string, unknown>;
    for (const name of [
        "loadInbox",
        "loadMissions",
        "loadItem",
        "loadMemories",
        "loadMission",
        "loadProjects",
        "loadProject",
    ]) {
        stub[name] = async () => undefined;
    }
    const tracker = state as unknown as Record<string, unknown>;
    tracker.projects = projects;
    // One mission filed in no project, shown below the cards.
    tracker.missions = [{ ...mission(1311, "Log retention clean-up", null, "idle", 0), project_id: null }];
    tracker.trackerView =
        trackerMode === "project"
            ? { open: true, view: "missions", selectedProjectId: 2645 }
            : { open: true, view: "missions" };
    if (trackerMode === "project") {
        tracker.trackerProject = {
            project: { ...projects[0], body: "Audit first, then the Mac app sets the direction and the web follows." },
            missions: [
                mission(
                    1706,
                    "Unify matron-web and the Mac app design",
                    "Step 7 (projects) in progress; steps 2 to 6 are open PRs.",
                    "running",
                    1,
                ),
                mission(1594, "Deploy matron-web to chat.example.com", null, "quiet", 0),
            ],
            needs_you: [
                {
                    id: "it_3939",
                    num: 3939,
                    kind: "question",
                    state: "open",
                    awaiting: "user",
                    title: "Merge unify step 2: sign-in follows the Mac app?",
                    origin_convo_id: "c1",
                    updated_at: now,
                    mission_id: "ms_1706",
                    mission_num: 1706,
                },
            ],
            recent_milestones: [
                {
                    id: "ml_1",
                    mission_id: "ms_1706",
                    num: 3946,
                    kind: "progress",
                    title: "Token PR merged and its deploy PR opened",
                    body: "",
                    convo_id: "c1",
                    seq: 1,
                    device_id: 1,
                    created_by: "agent",
                    created_at: now - 3_600_000,
                    mission_num: 1706,
                },
                {
                    id: "ml_2",
                    mission_id: "ms_1706",
                    num: 3668,
                    kind: "user_input",
                    title: "User: run phase 2 all the way through, missions included",
                    body: "",
                    convo_id: "c1",
                    seq: 2,
                    device_id: 1,
                    created_by: "agent",
                    created_at: now - 20 * 3_600_000,
                    mission_num: 1706,
                },
            ],
            sessions_by_box: { ash: 1, "build-box": 1 },
        };
    }
}

if (trackerMode === "memories" || trackerMode === "memory") {
    const now = Date.now();
    const memory = (name: string, type: string, description: string, body: string, ago: number) => ({
        id: `me_${name}`,
        name,
        type,
        description,
        body,
        origin_convo_id: "c1",
        origin_device_id: 1,
        created_by: "agent",
        updated_by: "agent",
        created_at: now - ago,
        updated_at: now - ago,
    });
    const memories = [
        memory(
            "full-pr-urls",
            "feedback",
            "In chat and in item bodies, give PRs as full URLs and items as links, never a bare number.",
            "**Why:** bare numbers are dead text in the apps.\n\n**How to apply:** every PR mention.",
            3_600_000,
        ),
        memory(
            "read-replica-only",
            "reference",
            "Answer production data questions from the read replica, never the primary database.",
            "",
            86_400_000,
        ),
        memory(
            "leave-local-snapshots",
            "feedback",
            "Never delete or thin local backup snapshots on the build machine.",
            "",
            2 * 86_400_000,
        ),
    ];
    const stub = client as unknown as Record<string, unknown>;
    for (const name of ["loadInbox", "loadMissions", "loadItem", "loadMemories", "loadMission"]) {
        stub[name] = async () => undefined;
    }
    const tracker = state as unknown as Record<string, unknown>;
    tracker.memories = memories;
    tracker.trackerView =
        trackerMode === "memory"
            ? { open: true, view: "memories", selectedMemoryName: "full-pr-urls" }
            : { open: true, view: "memories" };
}

if (trackerMode === "inbox" || trackerMode === "item") {
    const day = 86_400_000;
    const now = Date.now();
    const baseItem = {
        state: "open",
        resolution: null,
        rank: 0,
        body: "",
        labels: [],
        links: [],
        supersedes: null,
        origin_convo_id: "c1",
        created_by: "agent",
        closed_at: null,
        mission_id: null,
        mission_num: null,
        comment_count: 0,
        last_comment_at: null,
        attachments: [],
        has_image: false,
    } as const;
    const items = [
        {
            ...baseItem,
            id: "it_1755",
            num: 1755,
            kind: "question",
            awaiting: "user",
            title: "Design audit done: confirm the phase 2 order and the five open design calls",
            body: "The side-by-side audit of matron-web against the Mac app is on a draft PR.",
            // Filed from another conversation than the selected one, so the context block shows
            // both the mission and the owner conversation.
            origin_convo_id: "c2",
            origin_device_id: 2,
            mission_id: "ms_1706",
            mission_num: 1706,
            comment_count: 2,
            has_image: true,
            created_at: now - 2 * 3_600_000,
            updated_at: now - 3_600_000,
        },
        {
            ...baseItem,
            id: "it_1694",
            num: 1694,
            kind: "task",
            awaiting: "agent",
            title: "matron-web: sign-in inputs overflow the card",
            body: "The inputs are wider than their panel: missing border-box sizing.",
            mission_id: "ms_1706",
            mission_num: 1706,
            created_at: now - day,
            updated_at: now - day,
        },
        {
            ...baseItem,
            id: "it_3646",
            num: 3646,
            kind: "decision",
            awaiting: null,
            title: "Warm dark ladder; teal button fills stay #0B6E7D in dark",
            body: "Three calls made to start phase 2 step 1.",
            created_at: now - 3 * day,
            updated_at: now - 3 * day,
        },
    ];
    const stub = client as unknown as Record<string, unknown>;
    for (const name of ["loadInbox", "loadMissions", "loadItem", "loadMemories", "loadMission"]) {
        stub[name] = async () => undefined;
    }
    const tracker = state as unknown as Record<string, unknown>;
    tracker.inboxItems = items;
    tracker.missions = [
        {
            id: "ms_1706",
            num: 1706,
            state: "open",
            title: "Unify matron-web and the Mac app",
            name: "Web/Mac unify",
            body: "",
            close_summary: null,
            closed_by: null,
            closed_over_open_items: 0,
            origin_convo_id: "c1",
            created_by: "agent",
            created_at: now - 9 * day,
            updated_at: now - day,
            last_milestone_at: null,
            closed_at: null,
            open_items: 2,
            needs_you: 1,
            conversations: 6,
            milestones: 0,
            last_milestone: null,
        },
    ];
    tracker.trackerView =
        trackerMode === "item" ? { open: true, view: "inbox", selectedItemId: 1755 } : { open: true, view: "inbox" };
    if (trackerMode === "item") {
        tracker.trackerItem = {
            item: items[0],
            comments: [
                {
                    id: "cm_1",
                    item_id: "it_1755",
                    author: "user",
                    device_id: 1,
                    kind: "comment",
                    body: "looks good, but leave the missions view until the desktop card layout is settled",
                    attachments: [],
                    meta: null,
                    created_at: now - 90 * 60_000,
                },
                {
                    id: "cm_2",
                    item_id: "it_1755",
                    author: "agent",
                    device_id: 2,
                    kind: "comment",
                    body: "Recorded. Phase 2 order and the five recommendations stand as proposed, with **missions on hold** until the Mac card dashboard is settled.",
                    attachments: [],
                    meta: null,
                    created_at: now - 88 * 60_000,
                    device_name: "workstation",
                    convo_id: "c1",
                    convo_title: "Web and Mac unify plan",
                },
                // A second session on another box in the same thread: the header tells them apart.
                {
                    id: "cm_3",
                    item_id: "it_1755",
                    author: "agent",
                    device_id: 3,
                    kind: "comment",
                    body: "The Mac card layout is on a branch; I will post here when it is ready to compare.",
                    attachments: [],
                    meta: null,
                    created_at: now - 40 * 60_000,
                    device_name: "build-box",
                    convo_id: "c-mac-cards",
                    convo_title: "Mac card dashboard: settle the layout before the missions view",
                },
                {
                    id: "cm_4",
                    item_id: "it_1755",
                    author: "agent",
                    device_id: 3,
                    kind: "comment",
                    body: "A comment whose session is not named shows the box alone.",
                    attachments: [],
                    meta: null,
                    created_at: now - 20 * 60_000,
                    device_name: "build-box",
                },
            ],
        };
    }
}

// Stub the new-session data path so a driver click on "New session" reaches the folders
// form (agent → recent folders) where the themed inputs / checkbox / Start live.
(client as unknown as { listAgents: () => Promise<unknown[]> }).listAgents = async () => [
    { device_id: "dev-local", connected: true, label: "workstation", hostname: "workstation", name: "workstation" },
];
(client as unknown as { recentFolders: () => Promise<unknown[]> }).recentFolders = async () => [
    { path: "/srv/app/web" },
    { path: "/srv/app/api" },
];

const params = new URLSearchParams(window.location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") === "dark" ? "dark" : "light");

// A real (decodable) 8x8 PNG so the harness image-preview path renders a true thumbnail
// instead of a broken-image glyph (garbage bytes don't decode).
const PNG_8X8 =
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVR42mNkYPhfz0AEYBxVSF+Fo25EGwUAaOQF/S2Q6iEAAAAASUVORK5CYII=";
const imageFile = (name: string): File =>
    new File([Uint8Array.from(atob(PNG_8X8), (c) => c.charCodeAt(0))], name, { type: "image/png" });

// Expose hooks so the Playwright driver can drive states (stage files → upload modal, etc.).
(window as unknown as { __matron: unknown }).__matron = {
    client,
    stageImage: (name = "screenshot.png") => client.stageFiles([imageFile(name)]),
    // Single NON-image file → hatched "image preview" placeholder + the single-file case
    // (no thumbnail strip, no "n of N" pill).
    stageDoc: () =>
        client.stageFiles([new File([new Uint8Array(1024)], "deploy-runbook.pdf", { type: "application/pdf" })]),
    stageTwo: () =>
        client.stageFiles([
            imageFile("Screenshot 2026-07-25 at 10.12.05.png"),
            new File([new Uint8Array(512)], "error-log.txt", { type: "text/plain" }),
        ]),
    setTheme: (t: string) => document.documentElement.setAttribute("data-theme", t),
    // Drive the child (subagent) view: select the running child s1 of parent c1 → back chip +
    // ↳ header + ringed current pill. The fixture client has no database, so selectConversation
    // no-ops; patch the state directly (mirrors the client's own patch()).
    selectChild: () =>
        (client as unknown as { patch: (update: Partial<ClientState>) => void }).patch({
            selectedConversationId: "s1",
            events: [],
            pendingMessages: [],
            sessionStatus: state.sessionStatus,
        }),
};

const container = document.getElementById("matron");
if (!container) throw new Error("fixture container missing");
createRoot(container).render(<MatronApp client={client} />);
