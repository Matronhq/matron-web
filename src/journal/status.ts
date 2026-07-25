/*
Copyright 2026 Matron Contributors.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only
Please see LICENSE files in the repository root for full details.
*/

import { type SessionStatus } from "./types";

export function normalizePercent(p: number): number | null {
    return Number.isFinite(p) ? Math.min(Math.max(p, 0), 100) : null;
}

export function worstLimit(
    limits: NonNullable<SessionStatus["limits"]>,
): NonNullable<SessionStatus["limits"]>[number] | undefined {
    let worst: NonNullable<SessionStatus["limits"]>[number] | undefined;
    let worstPercent = -Infinity;

    for (const limit of limits) {
        const percent = normalizePercent(limit.percent);
        if (percent !== null && percent > worstPercent) {
            worst = limit;
            worstPercent = percent;
        }
    }

    return worst;
}

export function compactTokens(tokens: number): string {
    if (tokens < 1_000) return String(tokens);
    if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;

    const millions = Math.round((tokens / 1_000_000) * 10) / 10;
    return `${millions.toLocaleString("en-US", { maximumFractionDigits: 1 })}m`;
}

export function usageBarLabel(label: string): string {
    const trimmed = label.trim();
    const match = trimmed.match(/\(([^()]*)\)$/);
    if (!match) return trimmed;

    const parenthesized = match[1].trim();
    if (!parenthesized) return trimmed;
    return parenthesized.toLocaleLowerCase() === "all models" ? trimmed.slice(0, match.index).trim() : parenthesized;
}

// v5 usage relabel map (design-tokens components.usageMeter.labelMap): the bridge
// sends long limit labels ("Session", "Week (all models)", "fable") that truncate in
// the 24px meter column. Bake fixed short strings client-side; unknown labels fall
// through to the usageBarLabel() heuristic so a new limit still renders a sensible tag.
const USAGE_SHORT_LABELS: Record<string, string> = {
    context: "ctx",
    Session: "5h",
    "Week (all models)": "wk",
    Week: "wk",
    fable: "fbl",
};

const WEEK_PER_MODEL = /^Week \((.+)\)$/i;

export function usageShortLabel(label: string): string {
    const trimmed = label.trim();
    const mapped = USAGE_SHORT_LABELS[trimmed];
    if (mapped) return mapped;
    // Per-model weekly limits ("Week (Sonnet 5)", "Week (Opus 4.8)") occupy the design's
    // model-weekly slot; abbreviate to a 3-char tag so they fit the 24px meter column
    // instead of truncating ("Son…"). "all models" is the aggregate week (handled above).
    const perModel = trimmed.match(WEEK_PER_MODEL);
    if (perModel && perModel[1].trim().toLocaleLowerCase() !== "all models") {
        return perModel[1].trim().slice(0, 3).toLocaleLowerCase();
    }
    return usageBarLabel(trimmed);
}

// Canonical 2×2 grid order (design static, column-first fill): ctx / session down the
// left column, model-weekly / week-all down the right. The bridge sends limits in an
// arbitrary order, so normalise before rendering.
export function usageOrderRank(label: string): number {
    const trimmed = label.trim();
    if (trimmed === "ctx" || trimmed === "context") return 0;
    if (trimmed === "Session") return 1;
    if (trimmed === "Week" || /^Week \(all models\)$/i.test(trimmed)) return 3;
    if (WEEK_PER_MODEL.test(trimmed)) return 2;
    return 4;
}

export function usageLevel(percent: number): "low" | "medium" | "high" {
    // Redesign-v4 thresholds: <50 green, 50–84 amber, ≥85 red.
    if (percent < 50) return "low";
    if (percent < 85) return "medium";
    return "high";
}

export function resetDisplay(resetsAt: string | undefined, fallback: string | undefined, now = Date.now()): string {
    if (!resetsAt) return fallback ?? "";

    const resetTime = Date.parse(resetsAt);
    if (!Number.isFinite(resetTime)) return fallback ?? "";

    const interval = resetTime - now;
    if (interval < 60_000) return "now";

    const totalMinutes = Math.floor(interval / 60_000);
    if (interval < 60 * 60_000) return `${totalMinutes}m`;
    if (interval < 6 * 60 * 60_000) {
        return `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`;
    }

    const date = new Date(resetTime);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: true })
        .format(date)
        .replaceAll(" ", "")
        .toLocaleLowerCase();
    return `${weekday} ${hour}`;
}

export function mergeSessionStatus(current: SessionStatus | undefined, update: SessionStatus): SessionStatus {
    return {
        model: update.model ?? current?.model,
        workdir: update.workdir ?? current?.workdir,
        context: update.context ?? current?.context,
        limits: update.limits ?? current?.limits,
        email: update.email ?? current?.email,
    };
}
