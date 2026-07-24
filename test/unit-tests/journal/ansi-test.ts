/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { type CSSProperties, type ReactElement, type ReactNode } from "react";

import { INITIAL_SGR_STATE, parseAnsi, stripLeadingSgrFragment } from "../../../src/journal/ansi";

type StyledElement = ReactElement<{
    children?: ReactNode;
    style?: CSSProperties;
}>;

function styledElement(node: ReactNode): StyledElement {
    expect(React.isValidElement(node)).toBe(true);
    return node as StyledElement;
}

function nodeText(nodes: ReactNode[]): string {
    return nodes
        .map((node) => {
            if (typeof node === "string" || typeof node === "number") return String(node);
            return String(styledElement(node).props.children ?? "");
        })
        .join("");
}

describe("parseAnsi", () => {
    it("returns plain text as one unstyled node", () => {
        const result = parseAnsi("plain text", INITIAL_SGR_STATE, "", 0);

        expect(result.nodes).toEqual(["plain text"]);
        expect(result.state).toEqual(INITIAL_SGR_STATE);
        expect(result.tail).toBe("");
    });

    it("renders green text and resets the foreground", () => {
        const result = parseAnsi("\x1b[32mgreen\x1b[0m plain", INITIAL_SGR_STATE, "", 0);

        expect(styledElement(result.nodes[0]).props).toMatchObject({
            children: "green",
            style: { color: "#98c379" },
        });
        expect(result.nodes[1]).toBe(" plain");
        expect(result.state).toEqual(INITIAL_SGR_STATE);
    });

    it("applies bold and clears it with SGR 22", () => {
        const result = parseAnsi("\x1b[1mbold\x1b[22mnormal", INITIAL_SGR_STATE, "", 0);

        expect(styledElement(result.nodes[0]).props).toMatchObject({
            children: "bold",
            style: { fontWeight: 600 },
        });
        expect(result.nodes[1]).toBe("normal");
        expect(result.state.bold).toBe(false);
    });

    it.each([
        ["background", "\x1b[47mhi"],
        ["inverse", "\x1b[7mhi"],
    ])("parses and ignores %s styling", (_name, input) => {
        const result = parseAnsi(input, INITIAL_SGR_STATE, "", 0);

        expect(result.nodes).toEqual(["hi"]);
        expect(result.state).toEqual(INITIAL_SGR_STATE);
        expect(nodeText(result.nodes)).not.toContain("\x1b");
    });

    it("parses and ignores dim while preserving a full-opacity foreground", () => {
        const result = parseAnsi("\x1b[2m\x1b[32mhi", INITIAL_SGR_STATE, "", 0);
        const element = styledElement(result.nodes[0]);

        expect(element.props.children).toBe("hi");
        expect(element.props.style).toEqual({ color: "#98c379" });
        expect(element.props.style).not.toHaveProperty("opacity");
        expect(element.props.style).not.toHaveProperty("backgroundColor");
        expect(nodeText(result.nodes)).not.toContain("\x1b");
    });

    it("applies compound bold and foreground parameters", () => {
        const result = parseAnsi("\x1b[1;31merror", INITIAL_SGR_STATE, "", 0);

        expect(styledElement(result.nodes[0]).props).toMatchObject({
            children: "error",
            style: { color: "#e06c75", fontWeight: 600 },
        });
    });

    it("holds an incomplete trailing escape in tail", () => {
        const result = parseAnsi("before\x1b[3", INITIAL_SGR_STATE, "", 0);

        expect(result.nodes).toEqual(["before"]);
        expect(result.tail).toBe("\x1b[3");
    });

    it("strips non-SGR CSI sequences while preserving surrounding text", () => {
        const result = parseAnsi("a\x1b[2Jb\x1b[3;4Hc", INITIAL_SGR_STATE, "", 0);

        expect(nodeText(result.nodes)).toBe("abc");
        expect(nodeText(result.nodes)).not.toContain("\x1b");
    });

    it("resets only the foreground with SGR 39", () => {
        const result = parseAnsi("\x1b[32mgreen\x1b[39mplain", INITIAL_SGR_STATE, "", 0);

        expect(styledElement(result.nodes[0]).props.style).toEqual({ color: "#98c379" });
        expect(result.nodes[1]).toBe("plain");
        expect(result.state.fg).toBeNull();
    });

    it.each([
        ["an unsupported 256 color", "\x1b[38;5;196mX"],
        ["a colliding foreground payload", "\x1b[38;5;31mX"],
        ["an unsupported background color", "\x1b[48;5;1mX"],
    ])("consumes %s as a unit without applying style", (_name, input) => {
        const result = parseAnsi(input, INITIAL_SGR_STATE, "", 0);

        expect(result.nodes).toEqual(["X"]);
        expect(result.state).toEqual(INITIAL_SGR_STATE);
        expect(nodeText(result.nodes)).toBe("X");
    });

    it("does not treat truecolor payload zeroes as reset parameters", () => {
        const previous = { fg: "#98c379", bold: true };
        const result = parseAnsi("\x1b[38;2;0;0;0mX", previous, "", 0);

        expect(styledElement(result.nodes[0]).props).toMatchObject({
            children: "X",
            style: { color: "#98c379", fontWeight: 600 },
        });
        expect(result.state).toEqual(previous);
    });

    it.each([
        [30, "#8b909a"],
        [90, "#a7adb8"],
    ])("clamps near-black SGR %i to %s", (code, color) => {
        const result = parseAnsi(`\x1b[${code}mtext`, INITIAL_SGR_STATE, "", 0);

        expect(styledElement(result.nodes[0]).props.style).toEqual({ color });
    });

    it("falls back to one plain-text node when dense styling exceeds the node budget", () => {
        const input = `${"\x1b[31mx\x1b[32my".repeat(1001)}\x1b[1mend\x1b[3`;
        const result = parseAnsi(input, INITIAL_SGR_STATE, "", 0);

        expect(result.nodes).toEqual([`${"xy".repeat(1001)}end`]);
        expect(result.state).toEqual({ fg: "#98c379", bold: true });
        expect(result.tail).toBe("\x1b[3");
    });
});

describe("stripLeadingSgrFragment", () => {
    it.each([
        ["[32mhello", "hello"],
        ["[mhello", "hello"],
        ["[1;31mx", "x"],
    ])("strips a leading orphan SGR fragment from %p", (input, expected) => {
        expect(stripLeadingSgrFragment(input)).toBe(expected);
    });

    it.each(["2ms latency", "32m remaining", "[link] x", "[0] done", "test output"])(
        "preserves non-fragment content %p",
        (input) => {
            expect(stripLeadingSgrFragment(input)).toBe(input);
        },
    );
});
