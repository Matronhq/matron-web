/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatronJournalClient } from "../client";
import { documentLinkKind, MarkdownBody } from "../markdown";
import {
    decodeMarkdownBytes,
    isPreviewableMarkdown,
    loadMarkdownText,
    MARKDOWN_PREVIEW_MAX_BYTES,
    MarkdownPreviewContext,
    MarkdownPreviewPanel,
    markdownPreviewReducer,
    type MarkdownPreviewTarget,
    useMarkdownPreviewPanel,
} from "../markdown-preview";
import { AttachmentChip } from "../tracker/ItemAttachments";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

async function mount(element: React.ReactElement): Promise<HTMLDivElement> {
    container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        root = createRoot(container!);
        root.render(element);
    });
    return container;
}

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const originalFetch = globalThis.fetch;

afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
});

function bytesResponse(text: string, status = 200): Response {
    const bytes = new TextEncoder().encode(text);
    return {
        ok: status >= 200 && status < 300,
        status,
        arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    } as unknown as Response;
}

function fakeClient(): { mediaUrl: jest.Mock; sessionGeneration: number } {
    return { mediaUrl: jest.fn((id: string) => Promise.resolve(`blob:test/${id}`)), sessionGeneration: 0 };
}

describe("isPreviewableMarkdown", () => {
    it("accepts the markdown MIME types whatever the name", () => {
        expect(isPreviewableMarkdown({ mime: "text/markdown", name: "notes", size: 10 })).toBe(true);
        expect(isPreviewableMarkdown({ mime: "text/x-markdown", name: "notes.txt", size: 10 })).toBe(true);
        expect(isPreviewableMarkdown({ mime: "Text/Markdown; charset=utf-8", name: "x", size: 10 })).toBe(true);
    });

    it("accepts a markdown extension only with an empty, text/plain or octet-stream MIME", () => {
        for (const name of ["README.md", "notes.MARKDOWN", "spec.mdown", "Plan.Md"]) {
            expect(isPreviewableMarkdown({ mime: "", name, size: 10 })).toBe(true);
            expect(isPreviewableMarkdown({ mime: "text/plain", name, size: 10 })).toBe(true);
            expect(isPreviewableMarkdown({ mime: "application/octet-stream", name, size: 10 })).toBe(true);
            expect(isPreviewableMarkdown({ name, size: 10 })).toBe(true);
        }
        expect(isPreviewableMarkdown({ mime: "text/html", name: "page.md", size: 10 })).toBe(false);
        expect(isPreviewableMarkdown({ mime: "image/png", name: "shot.md", size: 10 })).toBe(false);
    });

    it("rejects non-markdown files", () => {
        expect(isPreviewableMarkdown({ mime: "text/plain", name: "build.log", size: 10 })).toBe(false);
        expect(isPreviewableMarkdown({ mime: "application/pdf", name: "doc.pdf", size: 10 })).toBe(false);
        expect(isPreviewableMarkdown({ mime: "", name: "notes.md.txt", size: 10 })).toBe(false);
        expect(isPreviewableMarkdown({ mime: "", name: "md", size: 10 })).toBe(false);
        expect(isPreviewableMarkdown({ mime: "", name: "", size: 10 })).toBe(false);
    });

    it("caps the size at 2 MB and treats an unknown size as previewable", () => {
        expect(isPreviewableMarkdown({ mime: "text/markdown", name: "a.md", size: MARKDOWN_PREVIEW_MAX_BYTES })).toBe(
            true,
        );
        expect(
            isPreviewableMarkdown({ mime: "text/markdown", name: "a.md", size: MARKDOWN_PREVIEW_MAX_BYTES + 1 }),
        ).toBe(false);
        expect(isPreviewableMarkdown({ mime: "text/markdown", name: "a.md" })).toBe(true);
        expect(isPreviewableMarkdown({ mime: "", name: "a.md", size: Number.NaN })).toBe(true);
    });
});

describe("document rendering (no remote content)", () => {
    it("classifies links: only http(s) and mailto are live", () => {
        expect(documentLinkKind("https://example.com/x")).toBe("external");
        expect(documentLinkKind("HTTP://example.com")).toBe("external");
        expect(documentLinkKind("mailto:a@b.c")).toBe("external");
        expect(documentLinkKind("./other.md")).toBe("inert");
        expect(documentLinkKind("other.md")).toBe("inert");
        expect(documentLinkKind("#anchor")).toBe("inert");
        expect(documentLinkKind("//evil.example/x")).toBe("inert");
        expect(documentLinkKind("matron://item/5")).toBe("inert");
        expect(documentLinkKind("javascript:alert(1)")).toBe("inert");
        expect(documentLinkKind("")).toBe("inert");
        expect(documentLinkKind(undefined)).toBe("inert");
    });

    it("never renders an image: remote, relative and attachment images show as alt text", async () => {
        const text = [
            "# Title",
            "",
            "![remote shot](https://tracker.example/pixel.png)",
            "",
            "![](https://tracker.example/no-alt.png)",
            "",
            "![local](./images/a.png) and ![att](attachment:aa11)",
            "",
            '<img src="https://tracker.example/raw.png">',
            "",
            "[site](https://example.com) [mail](mailto:a@b.c) [rel](./other.md) [frag](#title)",
        ].join("\n");
        const view = await mount(<MarkdownBody text={text} label="doc" variant="document" />);

        expect(view.querySelectorAll("img")).toHaveLength(0);
        expect(view.innerHTML).not.toContain("<img");
        const alts = Array.from(view.querySelectorAll(".mj_MdImageAlt")).map((node) => node.textContent);
        expect(alts).toEqual(["remote shot", "https://tracker.example/no-alt.png", "local", "att"]);
        // Image URLs are never hrefs either.
        const hrefs = Array.from(view.querySelectorAll("a")).map((anchor) => anchor.getAttribute("href"));
        expect(hrefs).toEqual(["https://example.com", "mailto:a@b.c"]);
        for (const anchor of view.querySelectorAll("a")) {
            expect(anchor.getAttribute("target")).toBe("_blank");
            expect(anchor.getAttribute("rel")).toContain("noopener");
        }
        const inert = Array.from(view.querySelectorAll(".mj_MdLinkInert")).map((node) => node.textContent);
        expect(inert).toEqual(["rel", "frag"]);
        expect(view.querySelector("h1")?.textContent).toBe("Title");
    });
});

describe("loading", () => {
    it("decodes UTF-8 and replaces invalid bytes", () => {
        expect(decodeMarkdownBytes(new TextEncoder().encode("café ✓"))).toBe("café ✓");
        expect(decodeMarkdownBytes(new Uint8Array([0x61, 0xff, 0x62]))).toBe("a�b");
    });

    it("fetches through the authenticated media path once per blob and caches the text", async () => {
        const client = fakeClient();
        globalThis.fetch = jest.fn(() => Promise.resolve(bytesResponse("# hi"))) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "r1")).resolves.toEqual({ kind: "text", text: "# hi" });
        await expect(loadMarkdownText(client, "r1")).resolves.toEqual({ kind: "text", text: "# hi" });
        expect(client.mediaUrl).toHaveBeenCalledTimes(1);
        expect(client.mediaUrl).toHaveBeenCalledWith("r1");
        expect(globalThis.fetch).toHaveBeenCalledWith("blob:test/r1");
    });

    it("starts a fresh cache after a sign-out and never caches a fetch that outlived its session", async () => {
        const client = fakeClient();
        globalThis.fetch = jest.fn(() => Promise.resolve(bytesResponse("first"))) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "s1")).resolves.toEqual({ kind: "text", text: "first" });

        client.sessionGeneration = 1;
        globalThis.fetch = jest.fn(() => Promise.resolve(bytesResponse("second"))) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "s1")).resolves.toEqual({ kind: "text", text: "second" });

        globalThis.fetch = jest.fn(() => {
            client.sessionGeneration = 2;
            return Promise.resolve(bytesResponse("stale"));
        }) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "s2")).rejects.toThrow("Not signed in");
        globalThis.fetch = jest.fn(() => Promise.resolve(bytesResponse("fresh"))) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "s2")).resolves.toEqual({ kind: "text", text: "fresh" });
    });

    it("falls back past 2 MB when the size was unknown", async () => {
        const client = fakeClient();
        const big = "x".repeat(MARKDOWN_PREVIEW_MAX_BYTES + 1);
        globalThis.fetch = jest.fn(() => Promise.resolve(bytesResponse(big))) as unknown as typeof fetch;
        await expect(loadMarkdownText(client, "big")).resolves.toEqual({
            kind: "tooLarge",
            size: MARKDOWN_PREVIEW_MAX_BYTES + 1,
        });
    });
});

describe("panel state", () => {
    const a: MarkdownPreviewTarget = { blobRef: "a", name: "a.md", size: 10 };
    const b: MarkdownPreviewTarget = { blobRef: "b", name: "b.md", size: 20 };

    it("opens, replaces and closes", () => {
        const opened = markdownPreviewReducer({}, { type: "open", target: a });
        expect(opened.target).toEqual(a);
        const replaced = markdownPreviewReducer(opened, { type: "open", target: b });
        expect(replaced.target).toEqual(b);
        expect(markdownPreviewReducer(replaced, { type: "open", target: { ...b } })).toBe(replaced);
        expect(markdownPreviewReducer(replaced, { type: "close" }).target).toBeUndefined();
        const empty = {};
        expect(markdownPreviewReducer(empty, { type: "close" })).toBe(empty);
    });

    function Harness({ client }: { client: MatronJournalClient }): React.ReactElement {
        const panel = useMarkdownPreviewPanel();
        return (
            <MarkdownPreviewContext.Provider value={panel.context}>
                <main>
                    <AttachmentChip attachment={{ blob_ref: "a", mime: "text/markdown", name: "a.md", size: 10 }} />
                    <AttachmentChip attachment={{ blob_ref: "b", mime: "", name: "b.md", size: 20 }} />
                    <AttachmentChip attachment={{ blob_ref: "c", mime: "text/plain", name: "c.log", size: 20 }} />
                    <AttachmentChip
                        attachment={{
                            blob_ref: "d",
                            mime: "text/markdown",
                            name: "huge.md",
                            size: MARKDOWN_PREVIEW_MAX_BYTES + 1,
                        }}
                    />
                </main>
                {panel.target ? (
                    <MarkdownPreviewPanel client={client} target={panel.target} onClose={panel.close} />
                ) : null}
            </MarkdownPreviewContext.Provider>
        );
    }

    it("opens from a chip, replaces on another chip, and closes with the button and Esc", async () => {
        const client = fakeClient();
        const texts: Record<string, string> = { a: "# Alpha\n\n![x](https://remote.example/x.png)", b: "Beta *body*" };
        globalThis.fetch = jest.fn((url: string) =>
            Promise.resolve(bytesResponse(texts[url.replace("blob:test/", "")] ?? "")),
        ) as unknown as typeof fetch;

        const view = await mount(<Harness client={client as unknown as MatronJournalClient} />);
        const chips = view.querySelectorAll("main button");
        // Only the two small markdown files are preview buttons.
        expect(chips).toHaveLength(2);
        expect(view.querySelector(".mj_MdPreview")).toBeNull();

        await act(async () => (chips[0] as HTMLButtonElement).click());
        const panel = view.querySelector(".mj_MdPreview")!;
        expect(panel.querySelector(".mj_MdPreview_name")?.textContent).toBe("a.md");
        expect(panel.querySelector("h1")?.textContent).toBe("Alpha");
        expect(panel.querySelectorAll("img")).toHaveLength(0);
        // The view beside it is still in the document.
        expect(view.querySelector("main")).not.toBeNull();

        // Source toggle shows the raw markdown.
        const sourceButton = Array.from(panel.querySelectorAll("button")).find((b) => b.textContent === "Source")!;
        await act(async () => sourceButton.click());
        expect(panel.querySelector(".mj_MdPreview_source")?.textContent).toBe(texts.a);
        await act(async () => sourceButton.click());
        expect(panel.querySelector(".mj_MdPreview_source")).toBeNull();

        (chips[1] as HTMLButtonElement).focus();
        await act(async () => (chips[1] as HTMLButtonElement).click());
        expect(view.querySelectorAll(".mj_MdPreview")).toHaveLength(1);
        expect(view.querySelector(".mj_MdPreview_name")?.textContent).toBe("b.md");
        expect(view.querySelector(".mj_MdPreview_doc em")?.textContent).toBe("body");

        await act(async () => view.querySelector<HTMLButtonElement>(".mj_MdPreview_close")!.click());
        expect(view.querySelector(".mj_MdPreview")).toBeNull();
        // Focus goes back to the chip that opened the file last, not the first one.
        expect(document.activeElement).toBe(chips[1]);

        (chips[0] as HTMLButtonElement).focus();
        await act(async () => (chips[0] as HTMLButtonElement).click());
        expect(view.querySelector(".mj_MdPreview")).not.toBeNull();
        expect(document.activeElement).toBe(view.querySelector(".mj_MdPreview_close"));
        await act(async () => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        });
        expect(view.querySelector(".mj_MdPreview")).toBeNull();
        expect(document.activeElement).toBe(chips[0]);
    });

    it("shows an error with Retry and Download, and retries", async () => {
        const client = fakeClient();
        let calls = 0;
        globalThis.fetch = jest.fn(() => {
            calls += 1;
            return Promise.resolve(calls === 1 ? bytesResponse("", 500) : bytesResponse("ok now"));
        }) as unknown as typeof fetch;
        const view = await mount(
            <MarkdownPreviewPanel
                client={client as unknown as MatronJournalClient}
                target={{ blobRef: "err", name: "e.md" }}
                onClose={jest.fn()}
            />,
        );
        const alert = view.querySelector("[role='alert']")!;
        expect(alert.textContent).toContain("500");
        const buttons = Array.from(alert.querySelectorAll("button")).map((b) => b.textContent);
        expect(buttons).toEqual(["Retry", "Download"]);
        await act(async () => alert.querySelector("button")!.click());
        expect(view.querySelector(".mj_MdPreview_doc")?.textContent).toBe("ok now");
    });
});
