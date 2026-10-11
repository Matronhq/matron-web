/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * "Developer view" (stored under `matron.developerView`): the one thread setting. A
 * per-operator client preference,
 * default OFF: the thread tucks each turn's steps into one turn card. ON renders
 * the thread exactly as it rendered before turn cards.
 */

import { useSyncExternalStore } from "react";

export const DEVELOPER_VIEW_KEY = "matron.developerView";

const listeners = new Set<() => void>();

export function readDeveloperView(): boolean {
    try {
        return localStorage.getItem(DEVELOPER_VIEW_KEY) === "true";
    } catch {
        return false;
    }
}

export function writeDeveloperView(value: boolean): void {
    try {
        if (value) localStorage.setItem(DEVELOPER_VIEW_KEY, "true");
        else localStorage.removeItem(DEVELOPER_VIEW_KEY);
    } catch {
        // Storage unavailable (private mode quota, disabled storage): the toggle still flips
        // for this tab through the in-memory override below.
    }
    override = value;
    for (const listener of listeners) listener();
}

// Last value written in this tab, so a failed storage write still takes effect here.
let override: boolean | undefined;

function snapshot(): boolean {
    return override ?? readDeveloperView();
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // Another tab flipped it: drop our override and re-read storage.
    const onStorage = (event: StorageEvent): void => {
        if (event.key !== DEVELOPER_VIEW_KEY && event.key !== null) return;
        override = undefined;
        listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
    };
}

/** [developerView, setDeveloperView] — shared by every component, synced across tabs. */
export function useDeveloperView(): [boolean, (value: boolean) => void] {
    const value = useSyncExternalStore(subscribe, snapshot, () => false);
    return [value, writeDeveloperView];
}

/** Test seam: forget the in-tab override. */
export function resetDeveloperViewForTests(): void {
    override = undefined;
}
