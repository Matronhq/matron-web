/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * "Subtask" lines and the subagent side pane.
 *
 * The bridge announces every Task/Agent tool call in the parent transcript as a plain text
 * message, `🔀 Subtask: <description>`, with no machine-readable link to the child conversation it
 * spawns. The child's title is the same label the description came from, so the line is matched
 * to a child by title (as the Mac app does): exact titles first, then a prefix match, because the
 * bridge cuts the description at 80 characters while the title is the full label. Duplicate
 * titles (the same agent run again) prefer a running child, then the newest.
 *
 * The side pane shares one slot beside the chat with the other per-chat panes. A subagent wins
 * the slot, as on the Mac; opening it closes the others.
 */

import { childrenOf, type ClientState, type Conversation, conversationTitle } from "./types";

const SUBTASK_PREFIX = "🔀 Subtask: ";

/** The description a bridge subtask line carries, or undefined when `body` is not one. The line
 *  is always the whole message (apart from surrounding whitespace), never part of one. */
export function subtaskDescription(body: string): string | undefined {
    const head = body.trimStart();
    if (!head.startsWith(SUBTASK_PREFIX)) return undefined;
    const description = head.slice(SUBTASK_PREFIX.length).trim();
    return description || undefined;
}

/** The child a subtask line most plausibly refers to, from `children` in creation order. */
export function resolveSubtaskTarget(description: string, children: readonly Conversation[]): Conversation | undefined {
    const exact = children.filter((child) => conversationTitle(child) === description);
    const matches =
        exact.length > 0 ? exact : children.filter((child) => conversationTitle(child).startsWith(description));
    for (let index = matches.length - 1; index >= 0; index -= 1) {
        if (matches[index].session_state === "running") return matches[index];
    }
    return matches[matches.length - 1];
}

/**
 * The conversations a subtask line in `convoId` can open. In a parent these are its children; in
 * a subagent they are its siblings, because the bridge flattens nested agents into siblings of
 * the top-level parent.
 */
export function subtaskCandidates(conversations: readonly Conversation[], convoId: string): Conversation[] {
    const own = conversations.find((conversation) => conversation.id === convoId);
    const parentId = own?.parent_convo_id || convoId;
    return childrenOf(conversations as Conversation[], parentId);
}

// ── The side pane beside the chat ────────────────────────────────────────────────────────────

/** Below this width of the chat area, the pane covers the chat instead of sitting beside it. */
export const SIDE_BY_SIDE_MIN_WIDTH = 820;
/** The chat keeps at least this much room beside the pane. */
export const CHAT_COLUMN_MIN_WIDTH = 420;
/** The pane opens at this width and can be dragged wider, never narrower. */
export const SIDE_PANE_MIN_WIDTH = 380;

/** A dragged pane width, kept between its minimum and what leaves the chat its minimum. */
export function clampSidePaneWidth(width: number, areaWidth: number): number {
    const max = Math.max(SIDE_PANE_MIN_WIDTH, areaWidth - CHAT_COLUMN_MIN_WIDTH);
    return Math.round(Math.min(max, Math.max(SIDE_PANE_MIN_WIDTH, width)));
}

export type ChatSidePane = { kind: "subchat"; parentId: string; childId: string };

/**
 * What the slot beside the chat shows, if anything. The pane belongs to the chat it was opened
 * from: another chat never inherits it, and coming back to that chat brings it back. Nothing
 * shows beside the tracker or beside a subagent opened on its own.
 */
export function chatSidePane(
    state: Pick<ClientState, "subChatPane" | "selectedConversationId" | "trackerView">,
): ChatSidePane | undefined {
    if (state.trackerView?.open || !state.selectedConversationId) return undefined;
    const subChat = state.subChatPane;
    if (subChat && subChat.parentId === state.selectedConversationId) return { kind: "subchat", ...subChat };
    return undefined;
}
