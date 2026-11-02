/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
    readDeveloperView,
    resetDeveloperViewForTests,
    DEVELOPER_VIEW_KEY,
    useDeveloperView,
    writeDeveloperView,
} from "../developer-view";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe(): React.ReactElement {
    const [on, set] = useDeveloperView();
    return (
        <button type="button" onClick={() => set(!on)}>
            {on ? "on" : "off"}
        </button>
    );
}

describe("Developer view preference", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        localStorage.clear();
        resetDeveloperViewForTests();
        container = document.createElement("div");
        document.body.append(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("defaults to OFF", () => {
        expect(readDeveloperView()).toBe(false);
        act(() => root.render(<Probe />));
        expect(container.textContent).toBe("off");
    });

    it("persists under matron.developerView and re-renders every subscriber", () => {
        act(() => root.render(<Probe />));
        act(() => container.querySelector("button")!.click());
        expect(container.textContent).toBe("on");
        expect(localStorage.getItem(DEVELOPER_VIEW_KEY)).toBe("true");
        act(() => writeDeveloperView(false));
        expect(container.textContent).toBe("off");
        expect(localStorage.getItem(DEVELOPER_VIEW_KEY)).toBeNull();
    });

    it("follows a change made in another tab", () => {
        act(() => root.render(<Probe />));
        act(() => {
            localStorage.setItem(DEVELOPER_VIEW_KEY, "true");
            window.dispatchEvent(new StorageEvent("storage", { key: DEVELOPER_VIEW_KEY }));
        });
        expect(container.textContent).toBe("on");
    });
});
