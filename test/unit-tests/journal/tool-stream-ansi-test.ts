/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ToolStream } from "../../../src/journal/components";
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
        const terminalRule = stylesheet.match(
            /\.mj_LiveTool pre\s*\{[^}]*background:\s*#1e2127;[^}]*color:\s*#dcdcdc;[^}]*\}/,
        );

        expect(sharedRule).not.toBeNull();
        expect(terminalRule).not.toBeNull();
        expect(terminalRule!.index).toBeGreaterThan(sharedRule!.index!);
    });
});
