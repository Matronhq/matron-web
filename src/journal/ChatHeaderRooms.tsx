/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * Two chat-header controls after the Mac's toolbar:
 *
 * - "Rooms · n" (RoomsControl): every agent-chat room this conversation takes part in, newest
 *   activity first (conversation-rooms.ts), each with its run state, its other participants,
 *   its last activity and a bell-slash when its notifications are off. Picking one opens it.
 *   Hidden for a chat that is in no room.
 * - The bell (ConvoNotifyBell): this conversation's notification level — All, Needs me, None,
 *   or Default to follow the mode — and a mute for 1 h, 8 h or until tomorrow 08:00. It turns
 *   into a bell-slash while nothing from the conversation notifies. Saved on the journal
 *   (PUT /notify), so the phone and the Mac follow it too. Hidden on a journal without
 *   notification settings.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { MatronJournalClient } from "./client";
import { useDismissablePopover } from "./components";
import {
    ROOM_STATE_LABEL,
    roomsAccessibilityLabel,
    roomsLabel,
    roomsOf,
    type ConversationRoom,
} from "./conversation-rooms";
import { BellIcon, BellSlashIcon, CheckIcon } from "./icons";
import {
    convoNotifyState,
    muteTime,
    NOTIFY_CONVO_LEVEL_TITLES,
    NOTIFY_DEFAULT_LEVEL_TITLE,
    NOTIFY_MUTE_DURATIONS,
    NOTIFY_MUTE_TITLES,
    notificationsFor,
    type NotifyConvoLevel,
} from "./notifications";
import { TaggedTitle } from "./SessionTag";
import { formatRelativeTime } from "./tracker/format";
import type { ClientState, Conversation } from "./types";

/** Arrow keys walk the menu's items; Escape closes it and gives focus back to the opener. */
function onMenuKeyDown(
    event: React.KeyboardEvent<HTMLElement>,
    close: () => void,
    openerRef: React.RefObject<HTMLButtonElement | null>,
): void {
    const items = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]'),
    );
    const index = items.findIndex((item) => item === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const next = index === -1 ? (step === 1 ? 0 : items.length - 1) : (index + step + items.length) % items.length;
        items[next]?.focus();
    } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        openerRef.current?.focus();
    }
}

/** A click-opened header menu: its opener, and its panel while open. */
function useHeaderMenu(): {
    open: boolean;
    setOpen: React.Dispatch<React.SetStateAction<boolean>>;
    close: () => void;
    openerRef: React.RefObject<HTMLButtonElement | null>;
    panelRef: React.RefObject<HTMLDivElement | null>;
} {
    const [open, setOpen] = useState(false);
    const openerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const close = useCallback(() => setOpen(false), []);
    useDismissablePopover(open, close, { openerRef, panelRef });
    useLayoutEffect(() => {
        if (open) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')?.focus();
    }, [open]);
    return { open, setOpen, close, openerRef, panelRef };
}

function roomRowLabel(room: ConversationRoom): string {
    return `${ROOM_STATE_LABEL[room.state]}, ${room.title}`;
}

function RoomPeers({ room, state }: { room: ConversationRoom; state: ClientState }): React.ReactElement | null {
    if (room.peers.length === 0 && room.unknownPeers === 0) return null;
    return (
        <span className="mj_RoomsMenu_peers">
            with{" "}
            {room.peers.map((peer: Conversation, index) => (
                <React.Fragment key={peer.id}>
                    {index > 0 && ", "}
                    <span className="mj_RoomsMenu_peer">
                        <TaggedTitle conversation={peer} agents={state.agents} />
                    </span>
                </React.Fragment>
            ))}
            {room.unknownPeers > 0 &&
                `${room.peers.length > 0 ? " and " : ""}${room.unknownPeers} other${room.unknownPeers === 1 ? "" : "s"}`}
        </span>
    );
}

export function RoomsControl({
    client,
    state,
    conversation,
}: {
    client: MatronJournalClient;
    state: ClientState;
    conversation: Conversation;
}): React.ReactElement | null {
    const rooms = useMemo(() => roomsOf(conversation.id, state.conversations), [conversation.id, state.conversations]);
    const notifier = notificationsFor(client);
    const settings = useSyncExternalStore(notifier.subscribeSettings, notifier.getSettingsSnapshot);
    const { open, setOpen, close, openerRef, panelRef } = useHeaderMenu();
    const label = roomsLabel(rooms.length);
    if (!label) return null;
    return (
        <div
            className="mj_RoomsControl"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
            }}
        >
            <button
                ref={openerRef}
                type="button"
                className="mj_RoomsControl_trigger"
                aria-label={roomsAccessibilityLabel(rooms.length)}
                title="Agent chat rooms this conversation is in"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                {label}
            </button>
            {open && (
                <div
                    ref={panelRef}
                    className="mj_HeaderMenu mj_RoomsMenu"
                    role="menu"
                    aria-label="Agent chat rooms"
                    onKeyDown={(event) => onMenuKeyDown(event, close, openerRef)}
                >
                    {rooms.map((room) => {
                        const silenced = convoNotifyState(settings.view, room.id, settings.now).silenced;
                        return (
                            <button
                                key={room.id}
                                type="button"
                                role="menuitem"
                                className="mj_RoomsMenu_item"
                                aria-label={roomRowLabel(room)}
                                onClick={() => {
                                    close();
                                    void client.selectConversation(room.id);
                                }}
                            >
                                <span className="mj_RoomsMenu_head">
                                    <span
                                        className={`mj_HeaderStatusDot mj_RoomsMenu_dot mj_RoomsMenu_dot_${room.state}`}
                                        aria-hidden="true"
                                    />
                                    <span className="mj_RoomsMenu_title">{room.title}</span>
                                    {silenced && (
                                        <BellSlashIcon className="mj_RoomsMenu_muted" aria-label="Notifications off" />
                                    )}
                                    {room.lastActivity !== undefined && (
                                        <span className="mj_RoomsMenu_time">
                                            {formatRelativeTime(room.lastActivity, Date.now())}
                                        </span>
                                    )}
                                </span>
                                <RoomPeers room={room} state={state} />
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function ConvoNotifyBell({
    client,
    convoId,
}: {
    client: MatronJournalClient;
    convoId: string;
}): React.ReactElement | null {
    const notifier = notificationsFor(client);
    const settings = useSyncExternalStore(notifier.subscribeSettings, notifier.getSettingsSnapshot);
    const { open, setOpen, close, openerRef, panelRef } = useHeaderMenu();
    if (!settings.view) return null;
    const convo = convoNotifyState(settings.view, convoId, settings.now);
    const levels: Array<[NotifyConvoLevel | null, string]> = [
        ["all", NOTIFY_CONVO_LEVEL_TITLES.all],
        ["needs_me", NOTIFY_CONVO_LEVEL_TITLES.needs_me],
        ["none", NOTIFY_CONVO_LEVEL_TITLES.none],
        [null, NOTIFY_DEFAULT_LEVEL_TITLE],
    ];
    const pick = (run: () => Promise<void>): void => {
        close();
        openerRef.current?.focus();
        void run();
    };
    const label = convo.silenced ? "Notifications off for this conversation" : "Notifications";
    return (
        <div
            className="mj_NotifyBell"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
            }}
        >
            <button
                ref={openerRef}
                type="button"
                className={`mj_IconButton mj_NotifyBell_trigger${convo.silenced ? " mj_NotifyBell_trigger_silenced" : ""}`}
                aria-label={label}
                title={label}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                {convo.silenced ? <BellSlashIcon aria-hidden /> : <BellIcon aria-hidden />}
            </button>
            {open && (
                <div
                    ref={panelRef}
                    className="mj_HeaderMenu mj_NotifyMenu"
                    role="menu"
                    aria-label="Notifications"
                    onKeyDown={(event) => onMenuKeyDown(event, close, openerRef)}
                >
                    <div className="mj_NotifyMenu_group" role="group" aria-label="Level">
                        <div className="mj_NotifyMenu_label" aria-hidden="true">
                            Level
                        </div>
                        {levels.map(([level, title]) => (
                            <button
                                key={level ?? "default"}
                                type="button"
                                role="menuitemradio"
                                aria-checked={convo.level === level}
                                className="mj_NotifyMenu_item"
                                data-level={level ?? "default"}
                                onClick={() => pick(() => notifier.setConvoLevel(convoId, level))}
                            >
                                <span className="mj_NotifyMenu_check" aria-hidden="true">
                                    {convo.level === level && <CheckIcon />}
                                </span>
                                {title}
                            </button>
                        ))}
                    </div>
                    <div className="mj_NotifyMenu_group" role="group" aria-label="Mute">
                        {convo.mutedUntil !== null && (
                            <button
                                type="button"
                                role="menuitem"
                                className="mj_NotifyMenu_item"
                                data-mute="unmute"
                                onClick={() => pick(() => notifier.unmuteConvo(convoId))}
                            >
                                <span className="mj_NotifyMenu_check" aria-hidden="true" />
                                Unmute (muted until {muteTime(convo.mutedUntil, settings.now)})
                            </button>
                        )}
                        {NOTIFY_MUTE_DURATIONS.map((duration) => (
                            <button
                                key={duration}
                                type="button"
                                role="menuitem"
                                className="mj_NotifyMenu_item"
                                data-mute={duration}
                                onClick={() => pick(() => notifier.muteConvo(convoId, duration))}
                            >
                                <span className="mj_NotifyMenu_check" aria-hidden="true" />
                                {NOTIFY_MUTE_TITLES[duration]}
                            </button>
                        ))}
                    </div>
                    {settings.error && (
                        <p className="mj_NotifyMenu_error" role="alert">
                            {settings.error}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
