/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { indicatorStep } from "../activity-text";
import { activityStep } from "../components";
import { liveLine } from "../turn-grouping";

jest.mock("../../../res/matron-logo-simple.svg", () => "matron-logo.svg");

describe("activityStep (the live line's step)", () => {
    it.each(["🔧 `pnpm test`", "📖 /repo/a.ts", "🔍 **/*.ts", "🔍 startSessionRpc", "🌐 https://example.com/docs"])(
        "reads %j as the durable line does",
        (detail) => {
            const durable = indicatorStep(detail, "x", true)!;
            expect(activityStep(detail, "x")).toEqual({ ...durable, status: "running" });
        },
    );

    it("keeps a live web search's query, so the live line names it", () => {
        const step = activityStep("🌐 matron bridge notice flag", "x")!;
        expect(step).toMatchObject({ tool: "WebSearch", input: { pattern: "matron bridge notice flag" } });
        expect(liveLine(step)).toBe("Searching the web for matron bridge notice flag…");
    });

    it("reads a nested subtask with its description", () => {
        expect(activityStep("🔀 Nested subtask: audit the routes", "x")).toMatchObject({
            tool: "Task",
            input: { description: "audit the routes" },
        });
    });

    it("reads Codex's unquoted live command as a command, even a single word", () => {
        expect(activityStep("🔧 pytest", "x")).toMatchObject({ tool: "Bash", input: { command: "pytest" } });
        expect(activityStep("🔧 ls -la", "x")).toMatchObject({ tool: "Bash", input: { command: "ls -la" } });
    });

    it("keeps its fallbacks for live lines no durable line has", () => {
        expect(activityStep("✏️ src/a.ts, src/b.ts", "x")).toMatchObject({
            tool: "apply_patch",
            input: { path: "src/a.ts" },
        });
        expect(activityStep("🔌 github/create_pr", "x")).toMatchObject({ tool: "tool" });
        expect(activityStep("pnpm test", "x")).toMatchObject({ tool: "Bash", input: { command: "pnpm test" } });
    });
});
