/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The labels an item detail's context block reads: the item's mission and the conversation that
 * owns the item (the one that filed it). Pure, so the rules are tested without a rendered detail.
 */

import { conversationBox } from "../boxes";
import { displayRawTitle } from "../SessionTag";
import type { AgentRosterEntry, Conversation, Mission, TrackerItem } from "../types";
import { itemOriginTitle } from "./format";

/** The label for a conversation no source could name. */
export const UNNAMED_CONVERSATION = "Conversation";

/**
 * A conversation's topic in display form. On a mission the journal names every conversation after
 * the mission, so the bridge's own title (`auto_title`) leads when there is one — the title would
 * only repeat the mission row. Null when neither is set.
 */
function topic(title: string | null | undefined, autoTitle: string | null | undefined): string | null {
    const auto = typeof autoTitle === "string" ? autoTitle.trim() : "";
    if (auto) return displayRawTitle(auto);
    const plain = typeof title === "string" ? title.trim() : "";
    return plain ? displayRawTitle(plain) : null;
}

/** The short conversation label: `box · topic`, either part when it is the only one known, else
 *  the generic "Conversation". */
export function conversationLabel(box: string | null | undefined, title: string | null | undefined): string {
    return [box?.trim(), title?.trim()].filter(Boolean).join(" · ") || UNNAMED_CONVERSATION;
}

/** The item's mission as the missions list carries it (matched by id, else by num); undefined when
 *  the list is not loaded or lacks it. */
export function itemMission(
    item: Pick<TrackerItem, "mission_id" | "mission_num">,
    missions: Mission[] | undefined,
): Mission | undefined {
    return missions?.find((mission) =>
        item.mission_id ? mission.id === item.mission_id : mission.num === item.mission_num,
    );
}

/** The mission row's text: `#num name` (the short name, else the title), or `Mission #num` when
 *  the mission is not known here. */
export function itemMissionText(num: number, mission: Pick<Mission, "title" | "name"> | undefined): string {
    const name = mission ? mission.name?.trim() || mission.title.trim() : "";
    return name ? `#${num} ${name}` : `Mission #${num}`;
}

/**
 * The label of the conversation that filed the item. The loaded conversation list first (it tracks
 * renames and knows the box), then the title the journal put on the item, which resolves origins
 * not in the list (older or archived chats). The box comes from the conversation's device, else
 * from the item's origin device when the roster knows it; "Conversation" when nothing names it.
 */
export function itemOriginLabel(
    item: Pick<TrackerItem, "origin_convo_id" | "origin_convo_title" | "origin_device_id">,
    conversations: Conversation[],
    agents: AgentRosterEntry[] | undefined,
): string {
    const convo = conversations.find((candidate) => candidate.id === item.origin_convo_id);
    const title = (convo && topic(convo.title, convo.auto_title)) || topic(itemOriginTitle(item), null);
    // The loaded conversation's own device first; the item's origin device covers a conversation
    // outside the list and a legacy one that carries no device.
    const box =
        (convo && conversationBox(convo, agents)?.name) ||
        agents?.find((entry) => entry.device_id === item.origin_device_id)?.name;
    return conversationLabel(box, title);
}
