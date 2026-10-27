/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MarkdownBody } from "../markdown";
import { TrackerLinkInfoContext, type TrackerLinkInfo, titleMatches } from "../tracker-link-title";
import type { NumberLookupOutcome } from "../types";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    container?.remove();
});

const OWN = `${window.location.origin}/u/alice`;

async function render(text: string, info?: TrackerLinkInfo): Promise<HTMLDivElement> {
    container = document.createElement("div");
    document.body.append(container);
    const body = <MarkdownBody text={text} label="msg" onTrackerLink={() => undefined} />;
    await act(async () => {
        root = createRoot(container!);
        root.render(
            info ? <TrackerLinkInfoContext.Provider value={info}>{body}</TrackerLinkInfoContext.Provider> : body,
        );
    });
    // Let the lookups settle.
    await act(async () => {
        await Promise.resolve();
    });
    return container;
}

const found = (kind: "item" | "mission" | "milestone" | "project", title: string, num = 12): NumberLookupOutcome => ({
    status: "found",
    hit: { kind, id: `${kind}_${num}`, num, title },
});

function chip(view: HTMLElement): HTMLElement | null {
    return view.querySelector<HTMLElement>("a.mj_TrackerLink .mj_TrackerLinkTarget");
}

describe("tracker link titles", () => {
    it("shows the kind and title of a bare #N link's target", async () => {
        const info = jest.fn().mockResolvedValue(found("item", "Ship the release notes"));
        const view = await render(`See [#12](${OWN}/12).`, info);

        expect(info).toHaveBeenCalledWith("alice", 12);
        expect(chip(view)?.textContent).toBe("item · Ship the release notes");
        expect(chip(view)?.classList.contains("mj_TrackerLinkTarget--mismatch")).toBe(false);
    });

    it("shows only the kind when the link already carries the right title", async () => {
        const info = jest.fn().mockResolvedValue(found("mission", "Ship the release notes"));
        const view = await render(`[#12 Ship the release…](${OWN}/12)`, info);

        expect(chip(view)?.textContent).toBe("mission");
        expect(chip(view)?.classList.contains("mj_TrackerLinkTarget--mismatch")).toBe(false);
    });

    it("flags a link whose written title is not its target's", async () => {
        const info = jest.fn().mockResolvedValue(found("item", "Late orders after the cut-off"));
        const view = await render(`[#12 Merge: printer export](${OWN}/12)`, info);

        expect(chip(view)?.textContent).toBe("item · Late orders after the cut-off");
        expect(chip(view)?.classList.contains("mj_TrackerLinkTarget--mismatch")).toBe(true);
        expect(chip(view)?.getAttribute("title")).toContain("#12 is not");
    });

    it("flags a number that does not exist", async () => {
        const info = jest.fn().mockResolvedValue({ status: "none" });
        const view = await render(`[#99](${OWN}/99)`, info);

        expect(chip(view)?.textContent).toBe("not found");
        expect(chip(view)?.classList.contains("mj_TrackerLinkTarget--mismatch")).toBe(true);
    });

    it("shows nothing extra when the journal cannot be asked", async () => {
        const info = jest.fn().mockResolvedValue({ status: "failed" });
        const view = await render(`[#12](${OWN}/12)`, info);

        expect(view.querySelector("a.mj_TrackerLink")?.textContent).toBe("#12");
        expect(chip(view)).toBeNull();
    });

    it("reads the old matron:// links against the signed-in user", async () => {
        const info = jest.fn().mockResolvedValue(found("project", "Launch", 5));
        const view = await render("[#5](matron://project/5) and [#6](matron://item/6)", info);

        expect(info).toHaveBeenCalledWith(null, 5);
        expect(info).toHaveBeenCalledWith(null, 6);
        expect(chip(view)?.textContent).toBe("project · Launch");
    });

    it("reads another user's link against that user", async () => {
        const info = jest.fn().mockResolvedValue(found("milestone", "First draft", 3));
        await render(`[#3](${window.location.origin}/u/bob/3)`, info);
        expect(info).toHaveBeenCalledWith("bob", 3);
    });

    it("renders the plain link where no lookup is provided", async () => {
        const view = await render(`[#12](${OWN}/12)`);
        expect(view.querySelector("a.mj_TrackerLink")?.textContent).toBe("#12");
        expect(chip(view)).toBeNull();
    });
});

describe("titleMatches", () => {
    it("accepts the title, a prefix of it, an abbreviation or a close paraphrase", () => {
        expect(titleMatches("Merge: printer XML…", "Merge: printer XML export for the run")).toBe(true);
        expect(titleMatches("late-orders item", "Late orders shipped after the cut-off: options")).toBe(true);
        expect(titleMatches("CAFÉ menu", "Cafe menu update")).toBe(true);
    });

    it("refuses a title about something else, and an empty one", () => {
        expect(titleMatches("the new merge question", "Late orders shipped after the cut-off")).toBe(false);
        expect(titleMatches("here", "Merge: printer XML export")).toBe(false);
        expect(titleMatches("", "Merge")).toBe(false);
    });
});
