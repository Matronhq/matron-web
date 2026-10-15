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

import { CloseIcon } from "./icons";
import { deferred } from "./lazy";

type SettingsSheetProps = ComponentProps<typeof import("./SettingsSheet").SettingsSheet>;
type CoordinatorChooserProps = ComponentProps<typeof import("./CoordinatorSheets").CoordinatorChooserSheet>;
type RoutinesSheetProps = ComponentProps<typeof import("./CoordinatorSheets").RoutinesSheet>;
type ChatTasksPaneProps = ComponentProps<typeof import("./tracker/ChatTasksPane").ChatTasksPane>;
type TrackerPaneProps = ComponentProps<typeof import("./tracker/TrackerPane").TrackerPane>;

const LOAD_FAILED = "Couldn't load this. Check your connection and try again.";

/**
 * Closes on Escape, as every sheet does, while only its frame is on screen. A modal frame also
 * swallows Tab, so focus can't wander to the page behind the scrim in the meantime.
 */
function useEscape(onClose: () => void, modal = false): void {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            if (modal && event.key === "Tab") {
                event.preventDefault();
                return;
            }
            if (event.key !== "Escape") return;
            event.preventDefault();
            onCloseRef.current();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [modal]);
}

/**
 * An empty modal sheet in the given classes. It takes no focus: the real sheet remembers the
 * element focused when it mounts, to return to on close, and that must still be the opener. Tab
 * is held instead, so focus stays on the opener until the sheet arrives.
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
    useEscape(onClose, true);
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
    (props, failed) => <ChatTasksFrame close={() => props.client.toggleChatTasks(false)} failed={failed} />,
);

/**
 * The tasks pane's header, with its close button: on a narrow window the pane covers the whole
 * chat, including the button that opened it, so the frame must be closable on its own.
 */
export function ChatTasksFrame({ close, failed }: { close: () => void; failed: boolean }): React.ReactElement {
    return (
        <aside className="mj_ChatTasks" aria-label="Tasks and decisions" aria-busy={!failed}>
            <header className="mj_ChatTasks_header">
                <h1 className="mj_ChatTasks_title">Tasks &amp; decisions</h1>
                <button
                    type="button"
                    className="mj_IconButton mj_ChatTasks_close"
                    aria-label="Close tasks and decisions"
                    title="Close"
                    onClick={close}
                >
                    <CloseIcon aria-hidden />
                </button>
            </header>
            {failed ? (
                <p className="mj_DeferredFailed" role="alert">
                    {LOAD_FAILED}
                </p>
            ) : null}
        </aside>
    );
}

export const TrackerPane = deferred<TrackerPaneProps>(
    () => import("./tracker/TrackerPane").then((module) => module.TrackerPane),
    (props, failed) => <TrackerFrame close={() => props.client.closeTrackerView()} failed={failed} />,
);

/** The tracker's top bar, with its close button. */
export function TrackerFrame({ close, failed }: { close: () => void; failed: boolean }): React.ReactElement {
    return (
        <div className="mj_TrackerPane" aria-busy={!failed}>
            <div className="mj_TrackerPane_top">
                <button
                    type="button"
                    className="mj_IconButton mj_TrackerPane_close"
                    aria-label="Close tracker"
                    onClick={close}
                >
                    <CloseIcon />
                </button>
                <h1 className="mj_TrackerPane_title">Tracker</h1>
            </div>
            {failed ? (
                <div className="mj_TrackerEmpty" role="alert">
                    <p className="mj_TrackerEmpty_title">{LOAD_FAILED}</p>
                </div>
            ) : null}
        </div>
    );
}
