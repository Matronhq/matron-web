/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

/*
 * The Search page: one field that searches everything. Conversation titles are filtered in
 * memory, as the Conversations search does; items, missions, projects and memories, and the
 * conversations whose messages match, come from the journal's `GET /search/all`, best match
 * first. A query that is just a number also offers the exact item, mission or project that
 * carries it. Chips narrow the page to one kind. The text and the last results live on the
 * client, so leaving the page and coming back shows them again.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { MatronJournalClient } from "../client";
import { NumberSearchResult } from "../goto-number";
import { ConversationsIcon, DecisionsIcon, MemoriesIcon, ProjectsIcon, SearchIcon } from "../icons";
import { renderSnippet } from "../snippet";
import type { ClientState, Conversation, GlobalSearchChat, GlobalSearchKind, GlobalSearchResult } from "../types";
import { TrackerGlyph } from "./glyphs";

/** Keystrokes settle for this long before the journal is asked. */
export const GLOBAL_SEARCH_DEBOUNCE_MS = 200;
/** At most this many conversation titles show above the tracker hits. */
const MAX_TITLE_HITS = 8;

type Filter = "all" | "conversations" | GlobalSearchKind | "messages";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
    { key: "all", label: "All" },
    { key: "conversations", label: "Conversations" },
    { key: "item", label: "Items" },
    { key: "mission", label: "Missions" },
    { key: "project", label: "Projects" },
    { key: "memory", label: "Memories" },
    { key: "messages", label: "Messages" },
];

const SECTION_TITLE: Record<GlobalSearchKind, string> = {
    item: "Items",
    mission: "Missions",
    project: "Projects",
    memory: "Memories",
};

/** How a hit was found, in words; the strict tiers need no label. */
const WHY_LABEL: Record<string, string> = {
    stemmed: "similar words",
    similar: "similar meaning",
    some_words: "some words",
};

/** Conversations whose title or latest message holds every word of the query. */
export function matchingConversations(conversations: Conversation[], query: string): Conversation[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return conversations
        .filter((c) => {
            // Title and latest-message snippet, as the Conversations search matches them.
            const text = `${c.title || ""} ${c.snippet || ""}`.toLowerCase();
            return words.every((word) => text.includes(word));
        })
        .slice(0, MAX_TITLE_HITS);
}

export function SearchPage({ client, state }: { client: MatronJournalClient; state: ClientState }): React.ReactElement {
    const query = state.globalSearchQuery ?? "";
    const trimmed = query.trim();
    const [filter, setFilter] = useState<Filter>("all");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => void client.searchEverything(query), GLOBAL_SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [client, query]);

    const titles = useMemo(() => matchingConversations(state.conversations, trimmed), [state.conversations, trimmed]);
    // Results belong to the query that produced them: a stale set never shows under new text.
    const search = state.globalSearch?.query === trimmed ? state.globalSearch : undefined;
    const byKind = (kind: GlobalSearchKind): GlobalSearchResult[] =>
        (search?.results ?? []).filter((r) => r.kind === kind);
    const show = (key: Filter): boolean => filter === "all" || filter === key;
    const nothing =
        !!search &&
        !search.loading &&
        !search.failed &&
        search.results.length === 0 &&
        search.chats.length === 0 &&
        titles.length === 0;

    return (
        <div className="mj_SearchPage">
            <div className="mj_ConversationSearch mj_SearchPage_field" role="search">
                <label className="mj_ConversationSearch_inputWrapper mj_noTextInput" htmlFor="global-search-input">
                    <SearchIcon aria-hidden />
                    <input
                        ref={inputRef}
                        id="global-search-input"
                        data-testid="global-search"
                        className="mj_ConversationSearch_input"
                        type="search"
                        value={query}
                        onChange={(event) => client.setGlobalSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape" && query) {
                                event.stopPropagation();
                                client.setGlobalSearchQuery("");
                            }
                        }}
                        placeholder="Search conversations, items, missions, memories…"
                        aria-label="Search everything"
                        autoComplete="off"
                        maxLength={256}
                    />
                </label>
            </div>
            <div className="mj_SearchPage_filters" role="tablist" aria-label="Show">
                {FILTERS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={filter === key}
                        className={`mj_SearchPage_chip${filter === key ? " mj_SearchPage_chip_active" : ""}`}
                        onClick={() => setFilter(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {!trimmed ? (
                <div className="mj_TrackerEmpty">
                    <p className="mj_TrackerEmpty_title">Search everything</p>
                    <p className="mj_TrackerEmpty_hint">
                        Conversations, items, missions, projects, memories and messages. Type a number to go straight to
                        it.
                    </p>
                </div>
            ) : (
                <>
                    {filter === "all" ? <NumberSearchResult client={client} query={trimmed} /> : null}
                    {show("conversations") && titles.length > 0 ? (
                        <Section title="Conversations">
                            {titles.map((c) => (
                                <HitRow
                                    key={c.id}
                                    icon={<ConversationsIcon />}
                                    title={c.title || "Untitled"}
                                    subtitle={c.snippet ? c.snippet : null}
                                    onOpen={() => void client.selectConversation(c.id)}
                                />
                            ))}
                        </Section>
                    ) : null}
                    {(["item", "mission", "project", "memory"] as const).map((kind) =>
                        show(kind) && byKind(kind).length > 0 ? (
                            <Section key={kind} title={SECTION_TITLE[kind]}>
                                {byKind(kind).map((r) => (
                                    <ResultRow key={`${r.kind}:${r.id}`} result={r} client={client} />
                                ))}
                            </Section>
                        ) : null,
                    )}
                    {show("messages") && (search?.chats.length ?? 0) > 0 ? (
                        <Section title="Messages">
                            {search!.chats.map((chat) => (
                                <ChatRow key={chat.convo_id} chat={chat} client={client} />
                            ))}
                        </Section>
                    ) : null}
                    {search?.failed ? (
                        <p className="mj_TrackerStaleNotice" role="status">
                            Search is unavailable right now.
                        </p>
                    ) : !search || search.loading ? (
                        <p className="mj_SearchPage_status" role="status">
                            Searching…
                        </p>
                    ) : nothing ? (
                        <div className="mj_TrackerEmpty">
                            <p className="mj_TrackerEmpty_title">No results</p>
                            <p className="mj_TrackerEmpty_hint">Nothing matches “{trimmed}”.</p>
                        </div>
                    ) : null}
                </>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
    return (
        <section className="mj_SearchPage_section" aria-label={title}>
            <h2 className="mj_SearchResults_heading">{title}</h2>
            <ul className="mj_SearchHitList" role="list">
                {children}
            </ul>
        </section>
    );
}

function HitRow({
    icon,
    title,
    subtitle,
    why,
    onOpen,
}: {
    icon: React.ReactNode;
    title: React.ReactNode;
    subtitle: React.ReactNode;
    why?: string;
    onOpen: () => void;
}): React.ReactElement {
    return (
        <li role="listitem">
            <button type="button" className="mj_SearchPage_row" onClick={onOpen}>
                <span className="mj_SearchPage_icon" aria-hidden="true">
                    {icon}
                </span>
                <span className="mj_SearchPage_text">
                    <span className="mj_SearchHit_title">{title}</span>
                    {subtitle ? <span className="mj_SearchHit_snippet">{subtitle}</span> : null}
                </span>
                {why ? <span className="mj_SearchPage_why">{why}</span> : null}
            </button>
        </li>
    );
}

function ResultRow({
    result,
    client,
}: {
    result: GlobalSearchResult;
    client: MatronJournalClient;
}): React.ReactElement {
    const { kind, num, name } = result;
    const label = kind === "memory" ? (name ?? result.title) : num != null ? `#${num} ${result.title}` : result.title;
    const subtitle = result.snippet
        ? renderSnippet(result.snippet)
        : kind === "memory" && name
          ? result.title
          : result.state;
    const icon =
        kind === "item" ? (
            <DecisionsIcon />
        ) : kind === "mission" ? (
            <TrackerGlyph mission="open" />
        ) : kind === "project" ? (
            <ProjectsIcon />
        ) : (
            <MemoriesIcon />
        );
    const open = (): void => {
        if (kind === "memory") client.openTrackerMemory(name ?? result.id);
        else if (num == null) return;
        else if (kind === "item") client.openTrackerItem(num);
        else if (kind === "mission") client.openTrackerMission(num);
        else client.openTrackerProject(num);
    };
    return <HitRow icon={icon} title={label} subtitle={subtitle} why={WHY_LABEL[result.why]} onOpen={open} />;
}

function ChatRow({ chat, client }: { chat: GlobalSearchChat; client: MatronJournalClient }): React.ReactElement {
    const count = chat.count > 1 ? ` · ${chat.count} messages` : "";
    return (
        <HitRow
            icon={<ConversationsIcon />}
            title={`${chat.title || "Untitled"}${count}`}
            subtitle={renderSnippet(chat.top.excerpt)}
            onOpen={() => client.openGlobalSearchChat(chat)}
        />
    );
}
