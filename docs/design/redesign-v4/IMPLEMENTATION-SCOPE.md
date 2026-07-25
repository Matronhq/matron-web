# Redesign v4 — implementation scope (whole remaining batch)

Scoped from `design-tokens.json` / `DESIGN-SPEC.md` / `Matron Redesign.dc.html` (claude-design, 2026-07-25).
Method: render the artifact headless, probe `[data-spec]` → canonical name → computed style (zero drift). The artifact wins over any prose.

**Already live (main f51727b, #518/#519):** header 2-zone layout (title flush-left + `model·context·run-state` subtitle + right controls), settings sliders icon, sidebar connection footer, header type measured-to-mock. This batch REVISES the header (below) to the newly-formalised responsive rules and completes the rest.

---

## Work-streams

### WS1 — Header revision (live header diverges from the v4 responsive spec)
Spec = pane-width (ResizeObserver on chat `<section>`), NOT viewport. Existing `useAdaptiveHeader` already observes pane width; retune thresholds + behaviours:

| Pane width | Spec behaviour | Delta from live |
|---|---|---|
| ≥760 | full 2×2 usage (300px) | live collapses at 700 → retune to 760 |
| <760 | **ctx bar only** + hover → 250px popover (all 4 meters + reset times) | live shows a `⬤ 72%` mini-pill, no 4-meter popover → rebuild collapsed usage |
| ≥560 | subtitle `model · workdir · status` + Compact visible | live shows model·context·state always; no workdir |
| <560 | subtitle → **status dot + short model**; hover title → popover (full title/model/workdir/status); **Compact hidden** | live keeps full subtitle + Compact → add <560 collapse + REINTRODUCE a title popover (removed in #518) |
| viewport ≤700 | single column; sidebar/chat swap via `state.screen`; back chevron | separate concern (mobile swap) |

Usage meter fidelity: bars order `[ctx, 5h, fbl, wk]`, 2×2 column-gap 16 row-gap 4, row grid `24px 1fr 32px` gap 7, **track height 4px** (live is 6px), ctx emphasised (`mono.usage` 500 + `--m-ink`) others 400 + `--m-ink2`, thresholds **<50 green / 50–84 amber / ≥85 red** (DECISION #4). Collapsed = single ctx row `24px 72px 32px`.
Touches: `HeaderShell`, `useAdaptiveHeader` (add 560/760 bands), `journal.pcss`. Re-triage #512/#514/#516 against this.

### WS2 — Sidebar typography + states + row rhythm
- Type: wordmark `title.lg` 15/600; session title `label.strong` 13/500 (read) / `title.sm` 13/600 (unread); preview `meta.md` 12/400 `--m-ink2`; timestamp `meta.xs` 11/400; tabs `label.xs` 12/500; search `body.xs` 13/400; New-session `label.md` 13/500; footer email `meta.md` 12/400.
- Row rhythm: padding `9px 10px`, **1px row gap** (claude-design restored this), glyph gap 10, title/preview gap 2.
- Status column (fixed 8px): running = pulsing teal dot; idle = `--m-line2` dot; pinned = 13px pin `--m-ink3`; favourite = 13px star `--m-amber`; subagent = 12px spinner + 26px indent.
- Selected row: `--m-selected` bg + **3px teal left bar**, inset 8px, radius 999.
- Tabs selected: `--m-panel` bg + `--m-sh-sm` + `--m-ink`. (aligns w/ #510 active-tab contrast)
Touches: `journal.pcss`, `shell.pcss`, `components.tsx` sidebar render. Overlaps #510.

### WS3 — Composer / text input
- Input `body.md` 14/22; **radius 12** (`--radius.composer`; live is xl=16 from #517 — reduce to 12), border `--m-line2`, focus = border-color `--m-accent` only (no ring/glow), placeholder `--m-ink3`.
- Buttons attach/mic/send 32×32; send radius 9, filled `--m-accent-deep`, disabled opacity .45 when empty.
- Hints row: `/ commands` · `shift+enter for newline` left, live `ctx N% · auto-idle in Nm` right, `meta.xs` 11/400.
- Slash palette (may be new): trigger `/^\/\S*$/`, `bottom: calc(100%+8px)`, max-height 262, row grid `auto auto minmax(0,1fr)` gap 9 pad `7px 12px`, z-20, 19 commands. Keyboard ↑/↓/Enter/Tab/Esc.
Touches: `shell.pcss` composer, `journal.pcss`, `components.tsx` composer + (new) slash palette.

### WS4 — Upload/attachment modal redesign (claude-design's headline update)
Current = single-file caption modal (PR #3). Target = multi-file queue:
- Card `min(440px, 94vw)`, max-height 88vh, three-part flex (fixed header / scroll body / fixed footer), radius 14, `--m-sh-lg`, scrim `rgb(18 16 14 / 55%)`, z-50.
- Header chip `n of N`; thumbnail strip 34px (active = 2px `--m-accent` ring, inactive = 1px `--m-line2` on `--m-raised`); large preview; caption per file (clears between files).
- Footer: **Skip** (advance w/o posting) · **Cancel/Cancel all** (ghost) · **Send** (primary; posts + advances; modal closes only after last file). Posted chip carries real name/size (DECISION #3 — drive from real FileList).
Touches: `components.tsx` upload modal, `journal.pcss`/`shell.pcss`, wire to `client.ts` upload queue.

### WS5 — Subagent strip (#520)
`SUBAGENTS` label `label.caps` 10/500 uppercase +.06em `--m-ink3`; pills `meta.md` 12/400 with **icon glyphs** (spinner running / check done) not text ✓/○; pad `7px 14px` gap 8.

### WS6 — Colour system + type scale adoption (cross-cutting foundation)
- Adopt the `--m-*` → `--cpd-*` mapping (design-tokens.json §mapToRepoTokens). Dark = 5-surface lightness ladder (`--m-app`<`--m-paper`<`--m-panel`<`--m-raised`<`--m-overlay`); add new `--m-overlay` (dark #282c32), `--m-diff-add/del`, `--m-app`. Verify `shell.pcss` dark matches.
- Emit the 27 `--m-font-*` roles (design-tokens.css) as the canonical type source; migrate ad-hoc font values to roles.
- Motion: 120ms `cubic-bezier(.2,0,0,1)`; chevron rotate; only `m-pulse`/`m-spin`/`m-wave`; no entrance animation. Layering z: handle 5 · palette 20 · popovers 30 · modal 50.
- Bubble radius grouping (first/middle/last corner tightening).

---

## Decisions needed before wiring (spec §Open items)
1. **Usage thresholds** <50 green / 50–84 amber / ≥85 red — spec calls this a design decision, not a repo constant. Confirm.
2. **Voice capture** transcript contract: stop → editable placeholder in composer, never auto-send. Confirm we build the recording UI now (ties to #511/#470) or defer.
3. **Upload queue** driven by real FileList (n-of-N, thumbnail ring, posted chip name/size). Confirm build-now vs. keep single-file for now.
4. **focus-visible**: not designed; implement as 2px `--m-accent` outline @ 2px offset (spec's stated intent). Confirm.

## Sequencing (all serialize on components.tsx / #448 — one window)
Foundation first, then per-component, each verified by probe-diff + multi-breakpoint screenshots, batched into one deploy:
WS6 (tokens/type foundation) → WS1 (header revision) → WS2 (sidebar) → WS3 (composer) → WS5 (subagent strip) → WS4 (upload modal, largest) → one Codex review → one atomic deploy.

Loop mapping: revise #518-followups #512/#514/#516 (header); #510 (tabs, folds into WS2); #520 (WS5); new loops for WS3 composer + WS4 upload modal + WS6 foundation.
