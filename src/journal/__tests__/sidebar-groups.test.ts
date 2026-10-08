/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { dayLabel, groupByDay } from "../sidebar-groups";
import type { Conversation } from "../types";

const convo = (id: string, lastTs: number): Conversation => ({
    id,
    title: id,
    session_state: "idle",
    last_seq: 1,
    unread_count: 0,
    snippet: "",
    created_at: lastTs,
    read_up_to_seq: 1,
    last_ts: lastTs,
});

const local = (y: number, m: number, d: number, h: number, min = 0): number => new Date(y, m, d, h, min).getTime();
const now = local(2026, 9, 4, 12);

describe("dayLabel", () => {
    it("names today, yesterday, a weekday within the week, else the date", () => {
        expect(dayLabel(local(2026, 9, 4, 11), now, "en-GB")).toBe("Today");
        expect(dayLabel(local(2026, 9, 3, 23, 59), now, "en-GB")).toBe("Yesterday");
        expect(dayLabel(local(2026, 9, 1, 9), now, "en-GB")).toBe("Thursday");
        expect(dayLabel(local(2026, 7, 25, 9), now, "en-GB")).toBe("25 August");
        expect(dayLabel(local(2025, 11, 31, 9), now, "en-GB")).toBe("31 December 2025");
    });
});

describe("groupByDay", () => {
    it("buckets consecutive rows by day label, preserving order within a group", () => {
        const rows = [
            convo("a", local(2026, 9, 4, 11)),
            convo("b", local(2026, 9, 4, 9)),
            convo("c", local(2026, 9, 3, 23, 59)),
            convo("d", local(2026, 9, 1, 9)),
            convo("e", local(2026, 7, 25, 9)),
        ];
        expect(groupByDay(rows, now, "en-GB")).toEqual([
            { label: "Today", rows: [rows[0], rows[1]] },
            { label: "Yesterday", rows: [rows[2]] },
            { label: "Thursday", rows: [rows[3]] },
            { label: "25 August", rows: [rows[4]] },
        ]);
    });

    it("falls back to created_at and returns no groups for no rows", () => {
        const row = { ...convo("a", local(2026, 9, 4, 8)), last_ts: undefined };
        expect(groupByDay([row], now)).toEqual([{ label: "Today", rows: [row] }]);
        expect(groupByDay([], now)).toEqual([]);
    });
});
