/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { boxFill, boxLetter, boxTint, paletteIndex, sessionTag, sessionTagForBox, splitTitle } from "../boxes";
import type { Conversation } from "../types";

const convo = (over: Partial<Conversation>): Conversation => ({
    id: "c",
    title: "t",
    session_state: "idle",
    last_seq: 0,
    unread_count: 0,
    snippet: "",
    created_at: 0,
    read_up_to_seq: 0,
    ...over,
});

const roster = [
    { device_id: 1, name: "ash", tag_char: null },
    { device_id: 2, name: "birch", tag_char: "B" },
];

describe("box palette", () => {
    it("hashes names with FNV-1a 32 like BoxChip.swift", () => {
        // FNV-1a("a") = 0xe40c292c = 3826002220 → % 10 = 0; FNV-1a("") = 2166136261 → % 10 = 1.
        expect(paletteIndex("a")).toBe(0);
        expect(paletteIndex("")).toBe(1);
        expect(paletteIndex("ash")).toBe(paletteIndex("ash"));
        const boxes = ["ash", "birch", "gum", "hazel", "pine", "maple", "ginkgo", "teak"];
        expect(new Set(boxes.map(paletteIndex)).size).toBeGreaterThan(1);
    });

    it("mixes the hue toward black in light and white in dark", () => {
        // "a" → .blue (0,122,255): × 0.65 in light, 0.3 toward white in dark.
        expect(boxTint("a", "light")).toBe("#004fa6");
        expect(boxTint("a", "dark")).toBe("#4da2ff");
        expect(boxFill("a")).toBe("rgb(0 122 255 / 0.18)");
    });
});

describe("session tags", () => {
    it("peels the bridge's [ab] short off a marked title", () => {
        expect(splitTitle("🐣 [53] Restart of the nightly deploy")).toEqual({
            marker: "🐣 ",
            short: "53",
            title: "Restart of the nightly deploy",
        });
        expect(splitTitle("↔️ [ab] mac ↔ dev-z")).toEqual({ marker: "↔️ ", short: "ab", title: "mac ↔ dev-z" });
        expect(splitTitle("[bd] live app design audit")).toEqual({
            marker: "",
            short: "bd",
            title: "live app design audit",
        });
        expect(splitTitle("plain title")).toEqual({ marker: "", short: undefined, title: "plain title" });
    });

    it("only treats exactly two alphanumerics as a short, so bracketed titles keep their prefix", () => {
        expect(splitTitle("[WIP] thing")).toEqual({ marker: "", short: undefined, title: "[WIP] thing" });
        // Two alphanumerics are a short by contract, so "[v2] release" is short "v2" (as on the Mac).
        expect(splitTitle("[v2] release")).toEqual({ marker: "", short: "v2", title: "release" });
        expect(splitTitle("[ab]")).toEqual({ marker: "", short: undefined, title: "[ab]" });
        expect(splitTitle("[ab] ")).toEqual({ marker: "", short: undefined, title: "[ab] " });
        expect(splitTitle("[ab]title")).toEqual({ marker: "", short: undefined, title: "[ab]title" });
        expect(splitTitle("🐣 plain")).toEqual({ marker: "🐣 ", short: undefined, title: "plain" });
    });

    it("uses the roster tag_char whole (one grapheme by contract), else the first letter upper-cased", () => {
        expect(boxLetter(roster[0])).toBe("A");
        expect(boxLetter(roster[1])).toBe("B");
        expect(boxLetter({ device_id: 3, name: "fox", tag_char: "🦊" })).toBe("🦊");
        expect(boxLetter({ device_id: 4, name: "ß-box", tag_char: " x " })).toBe("x");
    });

    it("builds a tag only with two or more boxes and a known device", () => {
        const c = convo({ title: "🐣 [53] x", agent_device_id: 1 });
        expect(sessionTag(c, roster)).toEqual({ letter: "A", name: "ash", short: "53" });
        expect(sessionTag(c, [roster[0]])).toBeUndefined();
        expect(sessionTag(c, undefined)).toBeUndefined();
        expect(sessionTag(convo({ title: "x", agent_device_id: 9 }), roster)).toBeUndefined();
        expect(sessionTag(convo({ title: "x", agent_device_id: null }), roster)).toBeUndefined();
    });
});

describe("sessionTagForBox", () => {
    const roster = [
        { device_id: 1, name: "maple", tag_char: "M" },
        { device_id: 2, name: "dev-z", tag_char: null },
    ];

    it("tags a row by its box name, with the title's short", () => {
        expect(sessionTagForBox("dev-z", "[ab] Mission", roster)).toEqual({ letter: "D", name: "dev-z", short: "ab" });
    });

    it("shows nothing for one box, an unknown box or no box", () => {
        expect(sessionTagForBox("maple", "[ab] x", [roster[0]])).toBeUndefined();
        expect(sessionTagForBox("nope", "[ab] x", roster)).toBeUndefined();
        expect(sessionTagForBox(null, "[ab] x", roster)).toBeUndefined();
        expect(sessionTagForBox("maple", "[ab] x", undefined)).toBeUndefined();
    });
});
