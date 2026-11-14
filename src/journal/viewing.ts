/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

type FocusDocument = Pick<Document, "visibilityState" | "hasFocus">;

export function isTabFocused(
    doc: FocusDocument | undefined = typeof document === "undefined" ? undefined : document,
): boolean {
    return !!doc && doc.visibilityState === "visible" && doc.hasFocus();
}

export function viewingConvoId(selectedId: string | null | undefined, doc?: FocusDocument): string | null {
    return isTabFocused(doc) ? (selectedId ?? null) : null;
}

export function watchTabFocus(win: Window, doc: Document | undefined, onChange: () => void): () => void {
    win.addEventListener("focus", onChange);
    win.addEventListener("blur", onChange);
    doc?.addEventListener("visibilitychange", onChange);
    return () => {
        win.removeEventListener("focus", onChange);
        win.removeEventListener("blur", onChange);
        doc?.removeEventListener("visibilitychange", onChange);
    };
}
