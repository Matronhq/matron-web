/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The chat area the subagent pane sizes itself against, kept apart from the pane itself so the
 * chat can measure it without loading the pane's code until a subagent first opens.
 */

import type React from "react";
import { useLayoutEffect, useState } from "react";

import { SIDE_BY_SIDE_MIN_WIDTH } from "./subtask";
import type { JournalEvent } from "./types";

/** One transcript row and its rendered content. */
export interface SubChatRow {
    event: JournalEvent;
    content: React.ReactNode;
}

/** Where the chat area is on screen: from the chat's left edge to the app's right edge, less a
 *  Markdown preview open at that edge. */
export interface ChatArea {
    left: number;
    top: number;
    bottom: number;
    width: number;
}

/**
 * Measures the chat area while `active`, following window and layout resizes. The pane decides
 * from it whether it fits beside the chat or covers it.
 */
export function useChatArea(
    app: React.RefObject<HTMLElement | null>,
    chat: React.RefObject<HTMLElement | null>,
    active: boolean,
): ChatArea | undefined {
    const [area, setArea] = useState<ChatArea>();
    useLayoutEffect(() => {
        if (!active) {
            setArea(undefined);
            return undefined;
        }
        const measure = (): void => {
            const appNode = app.current;
            const chatNode = chat.current;
            if (!appNode || !chatNode) return;
            const appRect = appNode.getBoundingClientRect();
            const chatRect = chatNode.getBoundingClientRect();
            // A Markdown preview open beside them takes its own room from the chat and the pane.
            const preview = appNode.querySelector(".mj_MdPreview");
            const previewWidth = preview ? preview.getBoundingClientRect().width : 0;
            const next = {
                left: Math.round(chatRect.left),
                top: Math.round(chatRect.top),
                bottom: Math.round(chatRect.bottom),
                width: Math.round(appRect.right - chatRect.left - previewWidth),
            };
            setArea((previous) =>
                previous &&
                previous.left === next.left &&
                previous.top === next.top &&
                previous.bottom === next.bottom &&
                previous.width === next.width
                    ? previous
                    : next,
            );
        };
        measure();
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : undefined;
        if (app.current) observer?.observe(app.current);
        if (chat.current) observer?.observe(chat.current);
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
        };
    }, [app, chat, active]);
    return area;
}

/** Whether the pane covers the chat rather than sitting beside it. Unmeasured counts as wide. */
export function paneCoversChat(area: ChatArea | undefined): boolean {
    return area !== undefined && area.width < SIDE_BY_SIDE_MIN_WIDTH;
}
