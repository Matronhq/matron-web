/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The sheets and panes that load in their own chunk (see lazy.tsx), each with the frame it shows
 * if it is opened before its chunk has arrived. Import them from here, never from their modules,
 * or the code lands back in the initial bundle.
 */

import React, { useEffect, useRef, type ComponentProps } from "react";
import { createPortal } from "react-dom";

import { deferred } from "./lazy";

type SettingsSheetProps = ComponentProps<typeof import("./SettingsSheet").SettingsSheet>;
type CoordinatorChooserProps = ComponentProps<typeof import("./CoordinatorSheets").CoordinatorChooserSheet>;
type RoutinesSheetProps = ComponentProps<typeof import("./CoordinatorSheets").RoutinesSheet>;
type ChatTasksPaneProps = ComponentProps<typeof import("./tracker/ChatTasksPane").ChatTasksPane>;
type TrackerPaneProps = ComponentProps<typeof import("./tracker/TrackerPane").TrackerPane>;

const LOAD_FAILED = "Couldn't load this. Check your connection and try again.";

/** Closes on Escape, as every sheet does, while only its frame is on screen. */
function useEscape(onClose: () => void): void {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onCloseRef.current();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);
}

/**
 * An empty modal sheet in the given classes. It takes no focus: the real sheet remembers the
 * element focused when it mounts, to return to on close, and that must still be the opener.
 */
export function SheetFrame({
    scrimClassName,
    sheetClassName,
    label,
    failed,
    onClose,
}: {
    scrimClassName: string;
    sheetClassName: string;
    label: string;
    failed: boolean;
    onClose: () => void;
}): React.ReactElement {
    useEscape(onClose);
    return createPortal(
        <div
            className={scrimClassName}
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className={sheetClassName} role="dialog" aria-modal="true" aria-label={label} aria-busy={!failed}>
                {failed ? (
                    <p className="mj_DeferredFailed" role="alert">
                        {LOAD_FAILED}
                    </p>
                ) : null}
            </div>
        </div>,
        document.body,
    );
}

export const SettingsSheet = deferred<SettingsSheetProps>(
    () => import("./SettingsSheet").then((module) => module.SettingsSheet),
    (props, failed) => (
        <SheetFrame
            scrimClassName="mj_SettingsScrim"
            sheetClassName="mj_SettingsSheet"
            label="Settings"
            failed={failed}
            onClose={props.onClose}
        />
    ),
);

export const CoordinatorChooserSheet = deferred<CoordinatorChooserProps>(
    () => import("./CoordinatorSheets").then((module) => module.CoordinatorChooserSheet),
    (props, failed) => (
        <SheetFrame
            scrimClassName="mj_UploadConfirm_scrim"
            sheetClassName="mj_UploadConfirm mj_NewSessionSheet mj_PinSheet"
            label="Coordinator"
            failed={failed}
            onClose={props.onClose}
        />
    ),
);

export const RoutinesSheet = deferred<RoutinesSheetProps>(
    () => import("./CoordinatorSheets").then((module) => module.RoutinesSheet),
    (props, failed) => (
        <SheetFrame
            scrimClassName="mj_UploadConfirm_scrim"
            sheetClassName="mj_UploadConfirm mj_NewSessionSheet mj_RoutinesSheet"
            label="Routines"
            failed={failed}
            onClose={props.onClose}
        />
    ),
);

export const ChatTasksPane = deferred<ChatTasksPaneProps>(
    () => import("./tracker/ChatTasksPane").then((module) => module.ChatTasksPane),
    (_props, failed) => (
        <aside className="mj_ChatTasks" aria-label="Tasks and decisions" aria-busy={!failed}>
            {failed ? (
                <p className="mj_DeferredFailed" role="alert">
                    {LOAD_FAILED}
                </p>
            ) : null}
        </aside>
    ),
);

export const TrackerPane = deferred<TrackerPaneProps>(
    () => import("./tracker/TrackerPane").then((module) => module.TrackerPane),
    (_props, failed) => (
        <div className="mj_TrackerPane" aria-busy={!failed}>
            {failed ? (
                <div className="mj_TrackerEmpty" role="alert">
                    <p className="mj_TrackerEmpty_title">{LOAD_FAILED}</p>
                </div>
            ) : null}
        </div>
    ),
);
