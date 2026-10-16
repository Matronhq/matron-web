/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { TextEncoder as NodeTextEncoder } from "node:util";

import { archiveStore, MatronJournalClient } from "../client";
import {
    applyArchiveChanges,
    archiveBatches,
    autoArchiveLabel,
    parseArchiveDelta,
    readArchiveSince,
    writeArchiveSince,
} from "../server-archive";
import type { ClientState, JournalControlFrame, ServerFrame, Session } from "../types";

const SESSION: Session = {
    serverUrl: "https://journal.example",
    token: "t",
    deviceId: 1,
    userId: 2,
    username: "alice",
};

beforeAll(() => {
    Object.defineProperty(globalThis, "TextEncoder", { value: NodeTextEncoder, configurable: true });
});
beforeEach(() => localStorage.clear());

describe("server archive helpers", () => {
    it("parses a delta, dropping malformed changes", () => {
        expect(
            parseArchiveDelta({
                changes: [
                    { convo_id: "a", archived_at: 5, auto: true },
                    { convo_id: "b", archived_at: null },
                    { convo_id: "", archived_at: 1 },
                    { convo_id: "c", archived_at: "x" },
                ],
                at: 9,
            }),
        ).toEqual({
            changes: [
                { convo_id: "a", archived_at: 5, auto: true },
                { convo_id: "b", archived_at: null, auto: false },
            ],
            at: 9,
        });
        expect(parseArchiveDelta({ at: 1 })).toBeUndefined();
        expect(parseArchiveDelta(null)).toBeUndefined();
    });

    it("applies changes in order and keeps the same set when nothing changes", () => {
        const ids = new Set(["a"]);
        expect(applyArchiveChanges(ids, [{ convo_id: "a", archived_at: 1, auto: false }])).toBe(ids);
        const next = applyArchiveChanges(ids, [
            { convo_id: "a", archived_at: null, auto: false },
            { convo_id: "b", archived_at: 2, auto: true },
        ]);
        expect([...next]).toEqual(["b"]);
        expect([...ids]).toEqual(["a"]);
    });

    it("batches at the journal's limit, labels the setting and stores the cursor", () => {
        const ids = Array.from({ length: 1001 }, (_, i) => `c${i}`);
        expect(archiveBatches(ids).map((b) => b.length)).toEqual([500, 500, 1]);
        expect(autoArchiveLabel(0)).toBe("Off");
        expect(autoArchiveLabel(30)).toBe("After 30 days");
        expect(readArchiveSince(SESSION)).toBeUndefined();
        writeArchiveSince(SESSION, 42);
        expect(readArchiveSince(SESSION)).toBe(42);
    });
});

type Internals = {
    state: ClientState;
    api: { setArchived: jest.Mock };
    archiveOnJournal: boolean;
    handleReady(hello?: JournalControlFrame): Promise<void>;
    applyHelloArchive(hello: JournalControlFrame): Promise<void>;
    handleFrame(frame: ServerFrame): Promise<void>;
};

function client(archived: string[] = []): { c: MatronJournalClient; i: Internals } {
    const c = new MatronJournalClient();
    const i = c as unknown as Internals;
    archiveStore.write(SESSION, new Set(archived));
    i.state = { ...c.getSnapshot(), phase: "signed-in", session: SESSION, archivedIds: new Set(archived) };
    i.api = { setArchived: jest.fn().mockResolvedValue({ changes: [] }) };
    return { c, i };
}

const hello = (archive: unknown): JournalControlFrame => ({ kind: "control", op: "hello_ok", archive });

describe("journal-synced archive in the client", () => {
    it("first sync: adopts the journal's set, carries local-only ids over, then stores the cursor", async () => {
        const { i } = client(["local", "both"]);
        await i.applyHelloArchive(
            hello({
                changes: [
                    { convo_id: "both", archived_at: 1, auto: false },
                    { convo_id: "remote", archived_at: 2, auto: true },
                ],
                at: 2,
            }),
        );
        expect([...i.state.archivedIds].sort()).toEqual(["both", "local", "remote"]);
        expect(i.api.setArchived).toHaveBeenCalledWith(["local"], true);
        expect(readArchiveSince(SESSION)).toBe(2);
        expect([...archiveStore.read(SESSION).ids].sort()).toEqual(["both", "local", "remote"]);
    });

    it("first sync: a failed carry-over leaves the cursor unset, so it is tried again", async () => {
        const { i } = client(["local"]);
        i.api.setArchived.mockRejectedValue(new Error("offline"));
        await i.applyHelloArchive(hello({ changes: [], at: 0 }));
        expect(readArchiveSince(SESSION)).toBeUndefined();
        expect([...i.state.archivedIds]).toEqual(["local"]);
    });

    it("later syncs and frames apply changes and advance the cursor", async () => {
        writeArchiveSince(SESSION, 10);
        const { i } = client(["a"]);
        await i.applyHelloArchive(hello({ changes: [{ convo_id: "a", archived_at: null, auto: false }], at: 20 }));
        expect([...i.state.archivedIds]).toEqual([]);
        expect(readArchiveSince(SESSION)).toBe(20);
        await i.handleFrame({ kind: "archive", changes: [{ convo_id: "b", archived_at: 30, auto: true }], at: 30 });
        expect([...i.state.archivedIds]).toEqual(["b"]);
        expect(readArchiveSince(SESSION)).toBe(30);
        expect(i.api.setArchived).not.toHaveBeenCalled();
    });

    it("an older journal (no archive in hello_ok) keeps the browser-local archive", async () => {
        const { c, i } = client([]);
        await i.applyHelloArchive(hello(undefined));
        expect(i.archiveOnJournal).toBe(false);
        c.archiveConversation("x");
        expect([...i.state.archivedIds]).toEqual(["x"]);
        expect(i.api.setArchived).not.toHaveBeenCalled();
    });

    it("Archive on a syncing journal is sent, and put back when the journal refuses", async () => {
        writeArchiveSince(SESSION, 1);
        const { c, i } = client([]);
        i.archiveOnJournal = true;
        c.archiveConversation("x");
        expect(i.api.setArchived).toHaveBeenCalledWith(["x"], true);
        i.api.setArchived.mockRejectedValueOnce(new Error("nope"));
        c.unarchiveConversation("x");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect([...i.state.archivedIds]).toEqual(["x"]);
        expect(i.state.controlError).toMatch(/Couldn't unarchive/);
    });
});
