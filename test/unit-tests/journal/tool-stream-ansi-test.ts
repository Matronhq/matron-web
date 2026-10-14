/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { collapsedToolStreamSlice, TOOL_STREAM_COLLAPSED_CAP_CHARS, ToolStream } from "../../../src/journal/components";
import type { ToolStreamState } from "../../../src/journal/types";

jest.mock("../../../res/matron-logo-simple.svg", () => "matron-logo.svg");

type MountedComponent = {
    container: HTMLDivElement;
    root: Root;
};

const mountedComponents: MountedComponent[] = [];

async function mountStream(stream: ToolStreamState): Promise<MountedComponent> {
    const container = document.createElement("div");
    const root = createRoot(container);
    const mounted = { container, root };
    mountedComponents.push(mounted);
    await act(async () => {
        root.render(React.createElement(ToolStream, { stream }));
    });
    return mounted;
}

function makeStream(content: string, headTruncated = false): ToolStreamState {
    return {
        messageRef: "message-1",
        command: "build",
        content,
        offset: 0,
        headTruncated,
    };
}

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    await act(async () => {
        for (const { root } of mountedComponents.splice(0)) root.unmount();
    });
});

describe("ToolStream ANSI rendering", () => {
    it("renders colored spans without literal escape text on the live-tool surface", async () => {
        const { container } = await mountStream(makeStream("\x1b[32mBUILD OK\x1b[0m"));
        const pre = container.querySelector("pre");
        const greenSpan = pre?.querySelector<HTMLSpanElement>("span");

        expect(greenSpan?.textContent).toBe("BUILD OK");
        expect(greenSpan?.style.color).toBe("rgb(152, 195, 121)");
        expect(pre?.textContent).not.toContain("\x1b[");
        expect(pre?.textContent).not.toContain("[32m");
        expect(pre?.closest(".mj_LiveTool")).not.toBeNull();
    });

    it("strips a leading SGR fragment and its color before adding the truncation prefix", async () => {
        const { container } = await mountStream(makeStream("[32mBUILD OK", true));
        const pre = container.querySelector("pre");

        expect(pre?.textContent).toBe("… earlier output omitted …\nBUILD OK");
        expect(pre?.textContent).not.toContain("[32m");
        expect(pre?.querySelector('span[style*="color"]')).toBeNull();
    });

    it("places the dedicated terminal surface rule after the shared preformatted block", () => {
        const stylesheet = readFileSync(resolve(process.cwd(), "src/journal/journal.pcss"), "utf8");
        const sharedRule = stylesheet.match(
            /\.mj_ToolCommand,\s*\.mj_ToolCard pre,\s*\.mj_LiveTool pre,\s*\.mj_Unknown pre\s*\{/,
        );
        // unify step 4: the terminal surface is the Mac's fixed dark block, via tokens.
        const terminalRule = stylesheet.match(
            /\.mj_LiveTool pre,\s*\.mj_ToolCard pre,\s*\.mj_Unknown pre\s*\{[^}]*background:\s*var\(--cpd-color-terminal-bg\);[^}]*color:\s*var\(--cpd-color-terminal-fg\);[^}]*\}/,
        );

        expect(sharedRule).not.toBeNull();
        expect(terminalRule).not.toBeNull();
        expect(terminalRule!.index).toBeGreaterThan(sharedRule!.index!);
    });
});

describe("ToolStream collapse", () => {
    it("starts collapsed to the tail and expands to the full output", async () => {
        const long = `${"early line\n".repeat(600)}last line`;
        const { container } = await mountStream(makeStream(long));
        const pre = container.querySelector("pre")!;
        const toggle = container.querySelector<HTMLButtonElement>("button[aria-label='Expand output']")!;
        expect(pre.classList.contains("mj_LiveTool_collapsed")).toBe(true);
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(pre.textContent!.startsWith("… earlier output omitted …\nearly line\n")).toBe(true);
        expect(pre.textContent!.length).toBeLessThan(long.length);
        expect(pre.textContent!.endsWith("last line")).toBe(true);

        await act(async () => toggle.click());
        expect(pre.classList.contains("mj_LiveTool_expanded")).toBe(true);
        expect(toggle.getAttribute("aria-label")).toBe("Collapse output");
        expect(pre.textContent).toBe(long);
    });

    it("keeps short output whole when collapsed", async () => {
        const { container } = await mountStream(makeStream("one\ntwo"));
        expect(container.querySelector("pre")?.textContent).toBe("one\ntwo");
    });
});

describe("collapsedToolStreamSlice", () => {
    it("cuts long output at a line boundary within the cap", () => {
        const sliced = collapsedToolStreamSlice(`${"line 1234\n".repeat(1000)}tail line`);
        expect(sliced.cut).toBe(true);
        expect(sliced.text.length).toBeLessThanOrEqual(TOOL_STREAM_COLLAPSED_CAP_CHARS);
        expect(sliced.text.startsWith("line 1234\n")).toBe(true);
        expect(sliced.text.endsWith("tail line")).toBe(true);
    });

    it("keeps one giant line whole rather than trimming through its only newline", () => {
        const sliced = collapsedToolStreamSlice(`${"x".repeat(TOOL_STREAM_COLLAPSED_CAP_CHARS)}\ntail`);
        expect(sliced.text.length).toBe(TOOL_STREAM_COLLAPSED_CAP_CHARS);
    });

    it("drops a leading SGR fragment left by the cut", () => {
        // The cut lands just after ESC, leaving "[32m" at the start of the tail.
        const sliced = collapsedToolStreamSlice(`a\x1b[32m${"z".repeat(TOOL_STREAM_COLLAPSED_CAP_CHARS - 4)}`);
        expect(sliced.cut).toBe(true);
        expect(sliced.text).toBe("z".repeat(TOOL_STREAM_COLLAPSED_CAP_CHARS - 4));
    });
});
