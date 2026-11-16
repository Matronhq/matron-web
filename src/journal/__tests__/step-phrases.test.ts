/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { describeCommand, describeStep, stepHeadline, stepLiveHeadline } from "../step-phrases";

const shell = (command: string): string => stepHeadline({ tool: "Bash", input: { command } });

describe("shell commands read as a person would skim them", () => {
    it.each([
        ["cd /srv/app && npm test -- --watch=false", "Ran the tests"],
        ["git add a.ts && git commit -m 'fix x'", "Saved a commit"],
        ["rg -n foo src", "Searched the code for “foo”"],
        ["cat src/a/paths.py", "Read paths.py"],
        ["npx prettier --check src", "Checked the formatting"],
        ["tsc --noEmit", "Checked the types"],
        ["gh pr create --title x", "Opened a PR"],
        ["sqlite3 data.db 'select 1'", "Queried a database"],
        ["sleep 30", "Waited"],
    ])("%s", (command, expected) => {
        expect(shell(command)).toBe(expected);
    });

    it("names an inline script by what it is, never by its source", () => {
        const phrase = shell("python3 - <<'EOF'\nimport os\nprint(os.environ['SECRET'])\nEOF");
        expect(phrase).toBe("Ran a script");
        expect(phrase).not.toContain("SECRET");
    });

    it("falls back to a neutral phrase and never echoes the arguments", () => {
        const phrase = describeCommand("xyzzy --token=abc123");
        expect(phrase.past).toBe("Ran xyzzy");
        expect(phrase.past).not.toContain("abc123");
    });

    it("lets the stage that says the most win over a leading cd", () => {
        expect(describeCommand("cd /srv/app && git push origin main").past).toBe("Pushed changes");
    });
});

describe("tool steps", () => {
    it("phrases file tools by the file's basename", () => {
        expect(stepHeadline({ tool: "Read", input: { path: "/a/b/paths.py" } })).toBe("Read paths.py");
        expect(stepHeadline({ tool: "Edit", input: { path: "/a/b/paths.py" } })).toBe("Edited paths.py");
        expect(stepHeadline({ tool: "Write", input: { path: "/a/b/new.ts" } })).toBe("Created new.ts");
        expect(stepHeadline({ tool: "Write", input: { path: "/a/b/new.ts" }, newFile: false })).toBe("Edited new.ts");
    });

    it("gives a live form with an ellipsis", () => {
        expect(stepLiveHeadline({ tool: "Read", input: { path: "/a/b/paths.py" } })).toBe("Reading paths.py…");
    });

    it("phrases search, web and helper tools", () => {
        expect(stepHeadline({ tool: "Grep", input: { pattern: "foo" } })).toBe("Searched the code for “foo”");
        expect(stepHeadline({ tool: "WebFetch", input: { url: "https://example.com/x?y=1" } })).toBe(
            "Opened example.com",
        );
        expect(stepHeadline({ tool: "Task", input: { description: "audit things" } })).toBe(
            "Started a helper: audit things",
        );
    });

    it("names an MCP server, and falls back for an unknown tool", () => {
        const mcp = describeStep({ tool: "mcp__acme_docs__lookup", input: {} });
        expect(mcp.past).toBe("Used acme docs");
        expect(mcp.fallback).toBe(true);
        expect(describeStep({ tool: "Mystery", input: {} })).toMatchObject({
            past: "Worked on a step",
            fallback: true,
        });
    });
});
