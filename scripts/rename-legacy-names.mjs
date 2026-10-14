#!/usr/bin/env node
/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * One-off codemod: renames the class names, CSS custom properties, test ids and identifiers
 * inherited from Element Web to Matron's own names. Run it on a branch that predates the rename
 * to bring that branch in line before rebasing:
 *
 *     node scripts/rename-legacy-names.mjs            # all steps
 *     node scripts/rename-legacy-names.mjs classes    # or: tokens, conversations
 *
 * It rewrites src/, test/, scripts/ and fixtures/ in place and is idempotent.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const self = fileURLToPath(import.meta.url);

// Ordered: longer / more specific names first, so a prefix rule never pre-empts an exact one.
const CLASSES = [
    // The chat header already carries mj_ChatHeader; the Element duplicates go.
    [/mx_RoomHeader light-panel mj_ChatHeader/g, "mj_ChatHeader"],
    [/\.mx_RoomHeader(?![\w-])/g, ".mj_ChatHeader"],
    ["mx_RoomHeader_", "mj_ChatHeader_"],
    [/(?<![\w-])mx_RoomHeader(?![\w-])/g, "mj_ChatHeader"],
    ["mx_MatrixChat", "mj_App"],
    ["mx_LeftPanel_newRoomList", "mj_Sidebar_list"],
    ["mx_LeftPanel_roomListContainer", "mj_Sidebar_listContainer"],
    ["mx_LeftPanel", "mj_Sidebar"],
    ["mx_RoomListPanel", "mj_ConversationListPanel"],
    ["mx_RoomListSearch", "mj_ConversationSearch"],
    ["mx_RoomView_MessageList", "mj_ChatView_messageList"],
    ["mx_RoomView", "mj_ChatView"],
    ["mj_RoomView", "mj_ChatView"],
    ["mx_EventTile", "mj_EventTile"],
    ["mx_MessageTimestamp", "mj_MessageTimestamp"],
    ["mx_MTextBody", "mj_TextBody"],
    ["mx_DisambiguatedProfile", "mj_SenderName"],
    ["mx_BasicMessageComposer", "mj_ComposerInput"],
    ["mx_MessageComposer", "mj_Composer"],
    ["mx_SlashPalette", "mj_SlashPalette"],
    ["mx_AutoHideScrollbar", "mj_AutoHideScrollbar"],
    ["mx_ResizeHandle", "mj_ResizeHandle"],
    ["mx_HomePage", "mj_HomePage"],
    ["mx_WhoIsTypingTile", "mj_TypingIndicator"],
    ["mx_MainSplit_timeline", "mj_MainSplit_timeline"],
    ["mx_lineClamp", "mj_lineClamp"],
    ["mx_no_textinput", "mj_noTextInput"],
    ["--RoomView_MessageList-padding", "--mj-message-list-padding"],
    ["--EventTile_bubble-margin-inline", "--mj-bubble-margin-inline"],
];

const TOKENS = [["--cpd-", "--mj-"]];

const CONVERSATIONS = [
    ["mj_RoomListHeader", "mj_ConversationListHeader"],
    ["mj_RoomList", "mj_ConversationList"],
    ["mj_RoomItemMenu", "mj_ConversationMenu"],
    [/\broom-list (search|scroll)/g, "conversation list $1"],
    [/(?<![\w-])room-list-search-input(?![\w-])/g, "conversation-search-input"],
    [/(?<![\w-])room-list-search(?![\w-])/g, "conversation-search"],
    [/(?<![\w-])room-list-header(?![\w-])/g, "conversation-list-header"],
    [/(?<![\w-])room-list(?![\w-])/g, "conversation-list"],
    [/(?<![\w-])room-name(?![\w-])/g, "conversation-name"],
    [/--(cpd|mj)-color-bg-room-canvas(?![\w-])/g, "--$1-color-bg-chat-canvas"],
    [/(?<![\w-])mj-room(?![\w-])/g, "mj-chat"],
    [/\broomMenuElementRef\b/g, "conversationMenuElementRef"],
    [/\broomMenuOpenerRef\b/g, "conversationMenuOpenerRef"],
    [/\bopenRoomMenuRef\b/g, "openConversationMenuRef"],
    [/\broomMenuRef\b/g, "conversationMenuRef"],
    [/\bcloseRoomMenu\b/g, "closeConversationMenu"],
    [/\bsetRoomMenu\b/g, "setConversationMenu"],
    [/\broomMenu\b/g, "conversationMenu"],
];

const STEPS = { classes: CLASSES, tokens: TOKENS, conversations: CONVERSATIONS };
const wanted = process.argv.slice(2);
const rules = (wanted.length ? wanted : Object.keys(STEPS)).flatMap((step) => {
    if (!STEPS[step]) throw new Error(`unknown step ${step}; use ${Object.keys(STEPS).join(", ")}`);
    return STEPS[step];
});

// A bare-string rule renames a class or prefix wherever it starts a name: not after another
// name character, so `mx_RoomView` does not touch `xmx_RoomView`, while `mx_RoomView_body`,
// `mx_RoomView--x` and `${"mx_RoomView"}` are all renamed.
const compiled = rules.map(([from, to]) =>
    typeof from === "string"
        ? [new RegExp(`(?<![\\w-])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), to]
        : [from, to],
);

function* files(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== "node_modules") yield* files(full);
        } else if (/\.(?:[cm]?[jt]sx?|p?css|html)$/.test(entry.name) && full !== self) {
            yield full;
        }
    }
}

let changed = 0;
for (const dir of ["src", "test", "scripts", "fixtures"]) {
    for (const file of files(path.join(root, dir))) {
        const before = fs.readFileSync(file, "utf8");
        const after = compiled.reduce((text, [from, to]) => text.replace(from, to), before);
        if (after !== before) {
            fs.writeFileSync(file, after);
            changed++;
        }
    }
}
console.log(`rename-legacy-names: ${changed} file(s) changed`);
