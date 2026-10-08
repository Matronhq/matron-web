/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { inlineRefsToText, type InlineSegment, splitInlineAttachments } from "../tracker/inline-attachments";
import type { TrackerAttachment } from "../types";

function png(blob_ref: string): TrackerAttachment {
    return { blob_ref, mime: "image/png", name: `${blob_ref}.png`, size: 100 };
}

/** A compact view of the segments: text as-is, an attachment as `@ref`. */
function shape(segments: InlineSegment[]): string[] {
    return segments.map((segment) => (segment.type === "text" ? segment.text : `@${segment.attachment.blob_ref}`));
}

function refs(attachments: TrackerAttachment[]): string[] {
    return attachments.map((attachment) => attachment.blob_ref);
}

describe("splitInlineAttachments — shared test vectors", () => {
    it("1: places a resolving ref between its text, the unused attachment trails", () => {
        const out = splitInlineAttachments("Before\n\n![login](attachment:aa11)\n\nAfter", [png("aa11"), png("bb22")]);
        expect(shape(out.segments)).toEqual(["Before", "@aa11", "After"]);
        expect(refs(out.trailing)).toEqual(["bb22"]);
        expect(out.segments[1]).toMatchObject({ type: "attachment", caption: "login" });
    });

    it("2: an unresolved ref becomes its caption text and is not placed", () => {
        const out = splitInlineAttachments("See ![x](attachment:zz99) here", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["See x here"]);
        expect(refs(out.trailing)).toEqual(["aa11"]);
    });

    it("3: a second ref to the same blob renders as caption text", () => {
        const out = splitInlineAttachments("![a](attachment:aa11) and again ![b](attachment:aa11)", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["@aa11", "and again b"]);
        expect(out.trailing).toEqual([]);
    });

    it("4: a ref inside a fenced code block is literal", () => {
        const body = "```\n![a](attachment:aa11)\n```";
        const out = splitInlineAttachments(body, [png("aa11")]);
        expect(shape(out.segments)).toEqual([body]);
        expect(refs(out.trailing)).toEqual(["aa11"]);
    });

    it("5: a ref inside an inline code span is literal", () => {
        const body = "`![a](attachment:aa11)`";
        const out = splitInlineAttachments(body, [png("aa11")]);
        expect(shape(out.segments)).toEqual([body]);
        expect(refs(out.trailing)).toEqual(["aa11"]);
    });

    it("6: an empty body has no segments and every attachment trails", () => {
        const out = splitInlineAttachments("", [png("aa11"), png("bb22")]);
        expect(out.segments).toEqual([]);
        expect(refs(out.trailing)).toEqual(["aa11", "bb22"]);
    });

    it("7: a ref with an empty caption still places the attachment", () => {
        const out = splitInlineAttachments("![](attachment:aa11)", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["@aa11"]);
        expect(out.segments[0]).toMatchObject({ caption: "" });
        expect(out.trailing).toEqual([]);
    });
});

describe("splitInlineAttachments — edges", () => {
    it("drops an unresolved ref with an empty caption entirely", () => {
        const out = splitInlineAttachments("![](attachment:zz99)", [png("aa11")]);
        expect(out.segments).toEqual([]);
        expect(refs(out.trailing)).toEqual(["aa11"]);
    });

    it("treats a tilde fence like a backtick fence, and matches again after it closes", () => {
        const body = "~~~\n![a](attachment:aa11)\n~~~\n\n![b](attachment:aa11)";
        const out = splitInlineAttachments(body, [png("aa11")]);
        expect(shape(out.segments)).toEqual(["~~~\n![a](attachment:aa11)\n~~~", "@aa11"]);
        expect(out.trailing).toEqual([]);
    });

    it("keeps an unclosed fence literal to the end of the body", () => {
        const body = "```js\ncode\n![a](attachment:aa11)";
        const out = splitInlineAttachments(body, [png("aa11")]);
        expect(shape(out.segments)).toEqual([body]);
    });

    it("matches a ref beside an inline code span", () => {
        const out = splitInlineAttachments("Run `make` then ![shot](attachment:aa11)", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["Run `make` then", "@aa11"]);
    });

    it("places a ref whose caption holds an inline code span", () => {
        const out = splitInlineAttachments("Run ![after `make`](attachment:aa11)", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["Run", "@aa11"]);
        expect(out.segments[1]).toMatchObject({ caption: "after `make`" });
        expect(inlineRefsToText("Run ![after `make`](attachment:aa11)")).toBe("Run after `make`");
    });

    it("keeps a ref literal when a code span opens inside it and closes after it", () => {
        const body = "![a `b](attachment:aa11) c`";
        const out = splitInlineAttachments(body, [png("aa11")]);
        expect(shape(out.segments)).toEqual([body]);
    });

    it("treats an unpaired backtick as literal, not as a code span", () => {
        const out = splitInlineAttachments("a ` b ![x](attachment:aa11)", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["a ` b", "@aa11"]);
    });

    it("places adjacent refs with no text between them", () => {
        const out = splitInlineAttachments("![a](attachment:aa11)\n![b](attachment:bb22)", [png("aa11"), png("bb22")]);
        expect(shape(out.segments)).toEqual(["@aa11", "@bb22"]);
    });

    it("keeps the indentation of a text segment's first line after a line break", () => {
        const out = splitInlineAttachments("![a](attachment:aa11)\n\n    indented code", [png("aa11")]);
        expect(shape(out.segments)).toEqual(["@aa11", "    indented code"]);
    });

    it("does not match a ref with a disallowed character in the blob ref", () => {
        const out = splitInlineAttachments("![a](attachment:aa.11)", [png("aa.11")]);
        expect(shape(out.segments)).toEqual(["![a](attachment:aa.11)"]);
        expect(refs(out.trailing)).toEqual(["aa.11"]);
    });

    it("returns a plain body unchanged", () => {
        const out = splitInlineAttachments("Just text\n\n- a list", []);
        expect(shape(out.segments)).toEqual(["Just text\n\n- a list"]);
    });
});

describe("inlineRefsToText", () => {
    it("turns refs into captions, drops empty ones, and keeps refs in code literal", () => {
        expect(inlineRefsToText("See ![the chart](attachment:aa11) and ![](attachment:bb22).")).toBe(
            "See the chart and .",
        );
        expect(inlineRefsToText("`![a](attachment:aa11)`")).toBe("`![a](attachment:aa11)`");
        expect(inlineRefsToText("plain")).toBe("plain");
    });
});
