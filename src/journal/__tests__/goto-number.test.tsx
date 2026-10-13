/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { MatronJournalClient } from "../client";
import {
    GoToNumberDialog,
    isGoToNumberShortcut,
    NUMBER_SEARCH_DEBOUNCE_MS,
    NumberSearchResult,
    parseTrackerNumber,
    useGoToNumberShortcut,
} from "../goto-number";
import type { NumberLookupOutcome } from "../types";

interface FakeClient {
    lookupNumber: jest.Mock<Promise<NumberLookupOutcome>, [number, AbortSignal?]>;
    openNumberHit: jest.Mock;
    openGoToNumber: jest.Mock;
    closeGoToNumber: jest.Mock;
}

function fakeClient(outcome: NumberLookupOutcome = { status: "none" }): FakeClient {
    return {
        lookupNumber: jest.fn().mockResolvedValue(outcome),
        openNumberHit: jest.fn().mockReturnValue(true),
        openGoToNumber: jest.fn(),
        closeGoToNumber: jest.fn(),
    };
}

const asClient = (client: FakeClient): MatronJournalClient => client as unknown as MatronJournalClient;

let roots: Root[] = [];

async function mount(element: React.ReactElement): Promise<HTMLElement> {
    const container = document.createElement("div");
    document.body.append(container);
    await act(async () => {
        const root = createRoot(container);
        roots.push(root);
        root.render(element);
    });
    return container;
}

function type(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submit(value: string): Promise<void> {
    const input = document.querySelector<HTMLInputElement>("#mj-goto-number")!;
    await act(async () => type(input, value));
    await act(async () => {
        document.querySelector<HTMLFormElement>(".mj_GoToSheet")!.requestSubmit();
    });
}

const message = (): string | undefined => document.querySelector("#mj-goto-message")?.textContent ?? undefined;

beforeAll(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    await act(async () => roots.forEach((root) => root.unmount()));
    roots = [];
    document.body.innerHTML = "";
    jest.useRealTimers();
});

describe("parseTrackerNumber", () => {
    it("accepts a bare number, with or without the number sign", () => {
        expect(parseTrackerNumber("412")).toBe(412);
        expect(parseTrackerNumber("#412")).toBe(412);
        expect(parseTrackerNumber("  # 412 ")).toBe(412);
    });

    it("rejects anything that is not just a positive number", () => {
        for (const text of ["", "#", "0", "-4", "4.5", "412 notes", "number 412", "##412", "4 12", "9".repeat(17)]) {
            expect(parseTrackerNumber(text)).toBeNull();
        }
    });
});

describe("isGoToNumberShortcut", () => {
    const key = (
        over: Partial<KeyboardEvent>,
    ): Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> => ({
        key: "j",
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        ...over,
    });

    it("is Cmd+J on a Mac and Ctrl+J elsewhere", () => {
        expect(isGoToNumberShortcut(key({ metaKey: true }), true)).toBe(true);
        expect(isGoToNumberShortcut(key({ ctrlKey: true }), true)).toBe(false);
        expect(isGoToNumberShortcut(key({ ctrlKey: true }), false)).toBe(true);
        expect(isGoToNumberShortcut(key({ metaKey: true }), false)).toBe(false);
        expect(isGoToNumberShortcut(key({ key: "J", ctrlKey: true }), false)).toBe(true);
    });

    it("ignores other keys and extra modifiers", () => {
        expect(isGoToNumberShortcut(key({}), false)).toBe(false);
        expect(isGoToNumberShortcut(key({ key: "k", ctrlKey: true }), false)).toBe(false);
        expect(isGoToNumberShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
        expect(isGoToNumberShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
    });
});

describe("useGoToNumberShortcut", () => {
    function Host({ client, enabled }: { client: FakeClient; enabled: boolean }): null {
        useGoToNumberShortcut(asClient(client), enabled);
        return null;
    }
    const press = (): boolean =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", ctrlKey: true, cancelable: true }));

    it("opens the field and swallows the key", async () => {
        const client = fakeClient();
        await mount(<Host client={client} enabled />);
        expect(press()).toBe(false);
        expect(client.openGoToNumber).toHaveBeenCalledTimes(1);
    });

    it("leaves the key alone while disabled", async () => {
        const client = fakeClient();
        await mount(<Host client={client} enabled={false} />);
        expect(press()).toBe(true);
        expect(client.openGoToNumber).not.toHaveBeenCalled();
    });
});

describe("GoToNumberDialog", () => {
    it("opens what the number is and closes", async () => {
        const hit = { kind: "item" as const, id: "it_1", num: 412 };
        const client = fakeClient({ status: "found", hit });
        await mount(<GoToNumberDialog client={asClient(client)} />);

        await submit("#412");

        expect(client.lookupNumber).toHaveBeenCalledWith(412);
        expect(client.openNumberHit).toHaveBeenCalledWith(hit, 412);
        expect(client.closeGoToNumber).toHaveBeenCalledTimes(1);
    });

    it("says so inline when nothing carries the number, and stays open", async () => {
        const client = fakeClient({ status: "none" });
        await mount(<GoToNumberDialog client={asClient(client)} />);

        await submit("412");

        expect(message()).toBe("No #412");
        expect(client.openNumberHit).not.toHaveBeenCalled();
        expect(client.closeGoToNumber).not.toHaveBeenCalled();

        // Editing the field clears the message.
        await act(async () => type(document.querySelector<HTMLInputElement>("#mj-goto-number")!, "41"));
        expect(message()).toBeUndefined();
    });

    it("tells a failed lookup apart from a missing number", async () => {
        const client = fakeClient({ status: "failed" });
        await mount(<GoToNumberDialog client={asClient(client)} />);
        await submit("412");
        expect(message()).toBe("Couldn't look up #412. Try again in a moment.");
    });

    it("explains a milestone that has nowhere to open", async () => {
        const client = fakeClient({ status: "found", hit: { kind: "milestone", id: "ml_1" } });
        client.openNumberHit.mockReturnValue(false);
        await mount(<GoToNumberDialog client={asClient(client)} />);
        await submit("412");
        expect(message()).toBe("#412 is a milestone, and its mission can't be opened here.");
        expect(client.closeGoToNumber).not.toHaveBeenCalled();
    });

    it("asks for a number without calling the journal when the text is not one", async () => {
        const client = fakeClient();
        await mount(<GoToNumberDialog client={asClient(client)} />);
        await submit("four");
        expect(message()).toBe("Enter a number, like 412.");
        expect(client.lookupNumber).not.toHaveBeenCalled();
    });

    it("Escape closes it", async () => {
        const client = fakeClient();
        await mount(<GoToNumberDialog client={asClient(client)} />);
        await act(async () => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
        });
        expect(client.closeGoToNumber).toHaveBeenCalledTimes(1);
    });
});

describe("NumberSearchResult", () => {
    const settle = async (): Promise<void> => {
        await act(async () => {
            jest.advanceTimersByTime(NUMBER_SEARCH_DEBOUNCE_MS);
            await Promise.resolve();
        });
    };
    const row = (container: HTMLElement): HTMLButtonElement | null => container.querySelector("button.mj_SearchHit");

    it("shows the row a bare number names, and opens it", async () => {
        jest.useFakeTimers();
        const hit = { kind: "mission" as const, id: "ms_1", num: 7, title: "Ship the tracker" };
        const client = fakeClient({ status: "found", hit });
        const container = await mount(<NumberSearchResult client={asClient(client)} query=" #7 " />);
        expect(row(container)).toBeNull();

        await settle();

        expect(client.lookupNumber).toHaveBeenCalledWith(7, expect.any(AbortSignal));
        expect(row(container)!.textContent).toBe("Mission #7Ship the tracker");
        await act(async () => row(container)!.click());
        expect(client.openNumberHit).toHaveBeenCalledWith(hit, 7);
    });

    it("shows nothing for a number nothing carries, or a query that is not a number", async () => {
        jest.useFakeTimers();
        const client = fakeClient({ status: "none" });
        const container = await mount(<NumberSearchResult client={asClient(client)} query="412" />);
        await settle();
        expect(row(container)).toBeNull();

        const words = fakeClient({ status: "found", hit: { kind: "item", id: "it_1", num: 412 } });
        const other = await mount(<NumberSearchResult client={asClient(words)} query="fix 412" />);
        await settle();
        expect(words.lookupNumber).not.toHaveBeenCalled();
        expect(row(other)).toBeNull();
    });

    it("never shows an earlier number's row under a later query", async () => {
        jest.useFakeTimers();
        const client = fakeClient({ status: "found", hit: { kind: "item", id: "it_1", num: 41 } });
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        roots.push(root);
        await act(async () => root.render(<NumberSearchResult client={asClient(client)} query="41" />));
        await settle();
        expect(row(container)!.textContent).toBe("Item #41");

        client.lookupNumber.mockReturnValue(new Promise(() => undefined));
        await act(async () => root.render(<NumberSearchResult client={asClient(client)} query="412" />));
        expect(row(container)).toBeNull();
    });
});
