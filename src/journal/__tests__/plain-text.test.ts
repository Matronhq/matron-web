/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { snippetText } from "../plain-text";

describe("snippetText (sidebar previews)", () => {
    it("reads as prose: bold, code, links and headings lose their markers", () => {
        expect(snippetText("**P1 — DISK_FULL** Build host is out of space")).toBe(
            "P1 — DISK_FULL Build host is out of space",
        );
        expect(snippetText("**Release notes — 2026-09-23 (cont.)** [v2.1](https://x.test/o) ships")).toBe(
            "Release notes — 2026-09-23 (cont.) v2.1 ships",
        );
        expect(snippetText("🔧 `sed -n 1,60p src/core/paths.py | grep -n`")).toBe(
            "🔧 sed -n 1,60p src/core/paths.py | grep -n",
        );
        expect(snippetText("# Heading first")).toBe("Heading first");
    });

    it("drops a mid-line heading and the unclosed marker a 120-char cut leaves behind", () => {
        expect(snippetText("Pushed. Session closed. ## Session summary **Do")).toBe(
            "Pushed. Session closed. Session summary Do",
        );
        expect(snippetText("ran `pnpm te")).toBe("ran pnpm te");
    });

    it("keeps what is not markup: issue hashes, snake_case, plain text", () => {
        expect(snippetText("Needs you — task #7 and #9")).toBe("Needs you — task #7 and #9");
        expect(snippetText("keep DISK_FULL and snake_case_names")).toBe("keep DISK_FULL and snake_case_names");
        expect(snippetText("Restarted nginx; error rate steady at 0.02%")).toBe(
            "Restarted nginx; error rate steady at 0.02%",
        );
        expect(snippetText("")).toBe("");
    });
});
