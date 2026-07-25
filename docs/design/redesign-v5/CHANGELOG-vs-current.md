# Redesign → current app: delta

Baseline read at `easelyte/matron-web@main`, tree `eb6e7d6f3c4b` (2026-07-25). Grounded in `journal.pcss`, `shell.pcss`, `components.tsx`, `status.ts` — not in a screenshot.

**Read this before implementing anything.** A large part of the redesign is already in the repo (the pcss carries `/* v4 … */` comments). The list below separates what has landed from what has not, so no one rebuilds what exists or eyeballs a stale screenshot again.

## Already implemented at this tree — do not redo

- 2×2 usage grid, column-first, ctx first and emphasised (`.mj_UsageCluster .mj_UsageBars`)
- Collapsed usage + popover (`.mj_UsageCluster_collapsed`, `.mj_UsagePopover`), header title disclosure (`.mj_HeaderTitleDisclosure`)
- Usage thresholds <50 / 50–84 / ≥85 (`usageLevel()` in `status.ts`, comment already cites redesign-v4)
- Sidebar tabs incl. **Favorites**, selected tab as raised chip + shadow (`.mj_RoomListTab_active`), tab counts, all seven `.mj_RoomListEmpty` copy variants
- Sidebar resize with persistence (`LEFT_PANEL_SIZE_KEY`), running/idle status dots, sidebar footer with connection status
- New session sheet, voice recording bar (`.mj_VoiceRecording`), upload queue dialog (`.mj_UploadConfirm_queue`, three-part flex, 88vh)
- Attachment chip with sending/error states and retry/cancel; tool card failed variant; diff card; `focus-visible` conventions (2px accent outline, offset 1–2px)
- Composer ctx hint readout (`ctxHintPct`)

## Divergences to reconcile (redesign vs current)

1. **Usage labels.** The bridge sends `Session`, `Week (all models)`, `Week (Sonnet 5)`; `usageBarLabel()` derives labels heuristically from parentheses. The redesign specifies fixed short labels **ctx / fbl / 5h / wk**. Replace the heuristic with an explicit relabel map (`design-tokens.json → components.usageMeter.labelMap`), falling back to `usageBarLabel()` for unknown labels so a new limit still renders.
2. **The fable limit does not exist in the payload.** Design shows four bars; today three arrive. The bar must be omitted (not shown empty) until the bridge emits it. Semantics — what it measures, its window, its reset cadence — are still undefined and are a product decision, not a design one.
3. **Agent turns: flat prose — CONFIRMED ALIGNED, not a divergence.** The redesign renders `data-self=false` turns as prose at a 32px indent with an avatar + name + time header, and reserves the teal bubble for the operator. The live app already does this. An earlier draft of this changelog listed it as a divergence; that came from `Matron Current.dc.html`, a recreation built from an older stylesheet snapshot, not from the running app. The recreation has been deleted rather than left to mislead. **No work here.**
4. **Date divider** (`canvas.dateDivider`) has no counterpart — new.
5. **Composer hint row** (`composer.hints`) has no counterpart — new; the ctx value it displays already exists.
6. **Upload queue strip** (`modal.upload.queue`) — the dialog exists, the thumbnail strip + "n of N" chip do not. Inactive thumbnail must use `--m-line2` on `--m-raised`; `--m-line` is invisible against `--m-overlay` in dark.
7. **Unknown events** get a dashed border on `--m-raised` in the redesign, so they read as diagnostic rather than as content.
8. **Question vs Permission.** Both are `.mj_PromptCard`. The redesign's only distinction: permission gets a teal-tinted border, an accent label, and exactly one filled affirmative. Do not diverge further.

## Not in the payload / not decided

- Fable limit semantics — open (see 2)
- `prefers-reduced-motion` handling for `m-pulse` / `m-spin` / `m-wave` — `journal.pcss` already has a reduced-motion block; the three redesign animations should join it
- Voice capture in the mock is fake: stopping inserts a placeholder transcript. Contract: the transcript is editable and never auto-sent

## Devtool — not product

`data-spec="devtool.stateMatrix"` (dashed button, sidebar footer) and `data-spec="gallery"` exist only to make states probeable. Do not implement either.
