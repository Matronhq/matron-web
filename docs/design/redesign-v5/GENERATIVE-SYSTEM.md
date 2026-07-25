# Generative system — the decisions the pixels don't carry

A reflection pass over building this design. Everything in `design-tokens.json` and `static/` describes **what the artifact is**. This file describes **the rules I was applying**, so the system extends correctly to screens I never drew and to real data I never saw. Where I made a judgement call and could have gone the other way, I say so.

Read this when you have to build something the mock doesn't show. If this file and the measured artifact disagree, the artifact wins on values — but this file wins on *intent*.

---

## 1. Responsive priority — the order of sacrifice

The static states show 760 and 560 as snapshots. The rule behind them is a strict order: as the chat pane narrows, things degrade in this sequence, and never out of order.

**Header, in order of what goes first:**

1. **Usage detail** — the 2×2 grid collapses to ctx-only + hover popover (at 760). Ctx is the meter you act on; the rate limits are reference. This is first because it frees ~130px for one lost glanceable value.
2. **Compact button** — hidden (at 560). It has a keyboard/menu path; it is the only header control that is purely convenient.
3. **Subtitle detail** — `model · workdir · status` → status dot + short model name (at 560). Workdir goes before model: you usually have one project per session but switch models within it. Status survives as a dot because "is it running" is the highest-frequency glance in the app.
4. **Title** — truncates, never hides, never wraps to two lines. It is the only thing that tells you which session you are typing into.
5. **Never sacrificed**: the title itself, the ctx bar, the send affordance, the connection status in the sidebar footer.

**Sidebar row, in order:**

1. Preview line truncates.
2. Timestamp shortens (`10:06` → `Wed` → `21 Jun`) rather than being dropped.
3. Session name truncates.
4. **Never dropped**: the status glyph column (8px, fixed) and the unread badge. If space is desperate, lose the preview line entirely before either of those.

**Message canvas:** prose max-width (680px) shrinks with the pane; code and diff bodies scroll horizontally rather than wrapping; the 32px agent indent is the *first* thing to give up below ~420px (drop to 0 and rely on the avatar row alone).

**Composer:** the hint row is the first casualty — it drops below ~420px. The attach/mic/send buttons never collapse into a menu; they are 32px and always visible.

**General rule:** at any width, one glance must answer *which session*, *is it running*, *how full is context*. Everything else is negotiable.

---

## 2. Content ranges I assumed, and what to do outside them

This is where a clean mock and real data part company. Per variable-length element: what I drew for, and the required behaviour beyond it.

| Element | Drawn for | Beyond it |
|---|---|---|
| Session name | 18–34 chars | Ellipsis, `title` attr with the full string. Never wrap. Assume up to ~200 chars from `/workdir` paths. |
| Session preview | 30–50 chars | Ellipsis at one line. Newlines in the source collapse to spaces first. |
| Header title | 18–40 chars | Ellipsis + the title popover (already designed) carries the full value. |
| Workdir | one path, ≤40 chars | Middle-ellipsis is acceptable here (`/opt/…/web-journal`) — the tail is more informative than the middle. The only place I'd allow middle-ellipsis. |
| Agent prose | 1–6 paragraphs | No cap. Long turns are the norm; do not add "show more". |
| Own message | 1–3 lines | Bubble grows; `overflow-wrap: anywhere` so an unbroken 400-char token cannot widen the column. |
| Code block | ≤40 lines | Scrolls vertically past ~360px, horizontally always. Never soft-wrap code. |
| Diff | ~8 rows, +6/−2 | Expanded body caps at ~360px then scrolls. Beyond ~400 rows, render the head and lean on "Open file ↗" — a 4000-line diff must not be a 4000-row DOM. |
| Tool output | 3 lines | Caps at 280px then scrolls; `Load full output` for blob-backed output; `Preview truncated` when truncated. |
| Filename | 20–45 chars | Ellipsis. **No extension is legal** — do not derive the icon from the extension alone; fall back to a generic file glyph. |
| Usage meters | 4 | 2×2 grid; a 5th and 6th flow into a third column and the cluster scrolls horizontally. Fewer than 4: the grid shrinks, rows do not stretch. |
| Subagent pills | 0–4 | Strip scrolls horizontally; each pill caps at ~240px. **Zero pills = hide the strip entirely**, do not leave an empty 41px bar. |
| Unread count | 1–2 digits | 3 digits widen the pill (`min-width` not fixed); beyond 999 show `999+`. |
| Upload queue | 1–3 files | Thumbnail strip scrolls; the `n of N` chip is authoritative, not the thumbnails. |
| Session list | 5–8 rows | Zero → the empty-state copy (seven variants, exact strings in `copy.emptyStates`). 200 rows → plain scroll, no virtualisation requirement at this scale, no grouping headers (deliberate: see anti-goals). |
| Agent turn with only an image | not drawn | Valid. The avatar/name/time header still renders; the image card sits at the 32px indent like prose. Do not special-case it into a bubble. |
| Empty agent turn | not drawn | Should not render at all. If the payload is empty, drop the turn rather than showing a naked header. |

---

## 3. Accessibility intent

Decisions I made while designing that never reached the export. These are design intent, not implementation suggestions.

**Focus order** follows visual order: sidebar (brand → new session → tabs → search → rows → footer), then header (title disclosure → usage → compact → menu), then the thread, then the composer (attach → textarea → mic → send). The composer is deliberately last so `Shift+Tab` from the textarea reaches the thread.

**Focus restoration**, always to the element that opened the thing:
- Upload modal closes → focus returns to the attach button.
- Slash palette closes → focus stays in the textarea, caret intact (the palette never takes focus in the first place; it is driven by the textarea's key handler).
- Header popovers close → focus returns to the trigger.
- A prompt/permission card resolving → focus moves to the composer, because answering means it is your turn again.

**Hover must never steal focus.** The usage and title popovers open on hover *and* on click/focus; the hover instance is decorative and non-focusable. If a popover is opened by keyboard it must be dismissible with `Escape` and must not close on `mouseleave`.

**Live regions:**
- The activity line ("claude is working") is `aria-live="polite"` — it is the primary signal that the agent is alive.
- A new agent turn arriving is `polite`, not `assertive`. Bursts of tool output must not machine-gun a screen reader; announce the turn, not each card.
- Permission requests are the one `assertive` case — they block progress and expire.
- Usage bars are `role="progressbar"` with `aria-valuenow` and an accessible label from the **long** limit name, not the short one: `ctx` is a visual abbreviation, "context 72 percent" is what should be read.

**Screen-reader text for state that is visual-only:** the status dot needs "running" / "idle" text; the teal left bar on the selected row needs `aria-current`; the spinner in a subagent pill needs "working"; the unread dot needs a count or "unread".

**Targets:** 32px is the desktop minimum I designed to; on touch every interactive element must reach 44px, which is why the composer buttons are 32px *icons* with padding to grow, not 32px hit areas.

---

## 4. Transition choreography

The still frames are endpoints. The sequences between them were decided and are not arbitrary.

- **Popover open:** on hover after ~0ms (no delay — this is a dense tool, not a marketing page), fades in over 120ms. On close, no delay either. A hover popover closes on `mouseleave`; a clicked one pins until click-away or `Escape`.
- **Card expand/collapse:** the chevron rotates over 120ms; the body appears immediately. I deliberately did **not** animate height — a diff expanding by 300px with an animated height makes the thread jump under the reader.
- **Send:** the bubble appears at final position with no entrance animation; the composer clears; scroll pins to bottom. If the user has scrolled up, do **not** yank them down — show the jump-to-bottom affordance instead. That distinction matters more than any animation.
- **Streaming agent turn:** text appends; the activity line sits *below* the turn while it streams and disappears when the turn completes. Never move the activity line above the content.
- **Recording:** entering swaps the input row for the recording bar in place, no slide. Stopping returns the input row with the transcript already in it and the caret at the end — the user's next action is almost always to edit or hit Enter.
- **Upload queue advance:** on Send, the modal stays open and its contents swap (counter, filename, thumbnail ring, cleared caption). The dialog itself must not close and reopen — it reads as one continuous task.
- **Theme switch:** instant. No cross-fade. A 200ms colour transition on a full app reads as a bug.
- **Anything that appears while the user is typing** (a new turn, a permission card) must not move the composer or steal the caret.

---

## 5. Component parameter space

The full API per component, including combinations the static states don't show. This is what makes it a system rather than 20 screens.

**PromptCard** — one component, one flag:
`{ kind: "question" | "permission", options: string[] (0..n), allowsFreeText: boolean, answered: boolean, readOnly: boolean, expired: boolean }`
- `kind` changes exactly three things: border tint, label text, and whether the first option renders as primary. Nothing else.
- `options: []` + `allowsFreeText: false` is legal and must still render the free-text row (that is what the live code does) — otherwise the card is a dead end.
- `answered` replaces the entire action area with one line. `readOnly` hides actions with no replacement line.
- Valid but undrawn: a permission card with 5 options (wrap to two rows, only the first is primary); a question with both options *and* free text (options row above, input row below).

**Card (tool / diff / generic)** — `{ collapsible: boolean, open: boolean, status: "ok" | "failed" | "expired" | "loading", header: nodes, body: nodes }`. `failed` tints the border critical and the badge red; it never changes the layout. A card with no body must render as a non-collapsible header row (no chevron).

**Usage meter** — `{ meters: [{ label, percent, resetsAt }], emphasisIndex: 0, collapsed: boolean }`. 1–6 meters valid. `percent` may be `null` → render the track with no fill and no percentage, never a zero-width fill that reads as 0%.

**Session row** — `{ status: "running" | "idle", pinned, favorite, unread: number | boolean, isSubagent, selected, archived }`. These compose: a pinned favourite unread subagent row is legal. Precedence in the 8px glyph column when several apply: **spinner (subagent working) > running dot > favourite star > pin > idle dot**. Only one glyph ever shows.

**Button** — `variant: primary | secondary | ghost | ghostDanger | icon`, `size: sm (28) | md (30) | lg (34)`, `state: rest | hover | active | focus | disabled`. There is exactly **one primary per action group** — if you find two filled buttons side by side, one is wrong.

**Bubble** — `{ own: boolean, position: "single" | "first" | "middle" | "last" }`. `own: false` is not a bubble at all; it is prose (see anti-goals).

---

## 6. Derivation rules — how to extend without asking me

- **Elevation is a surface step, not a shadow.** A thing that sits on top of another moves one rung up the ladder (`--m-paper` → `--m-panel` → `--m-raised` → `--m-overlay`) and gains a border. Shadows only mark things that genuinely float: popovers (`--m-sh-md`) and the modal (`--m-sh-lg`).
- **New surface? Never invent a colour.** Pick the adjacent rung. If two adjacent surfaces need separating, add a `1px solid var(--m-line)` — not a new grey.
- **Accent is for one thing at a time.** Teal marks *the* action, *the* selection, *the* live thing. Two teal elements competing in one region means one should be `--m-ink2`.
- **Text colour is a three-step hierarchy, always:** `--m-ink` for content, `--m-ink2` for labels and metadata, `--m-ink3` for hints and timestamps. Never introduce a fourth step; if something needs to recede further, make it smaller, not lighter.
- **Type: pick the nearest existing role.** If nothing fits, the answer is almost always that the element belongs to an existing role and the design is wrong, not that a new size is needed. (I found ten accidental sizes in my own file doing exactly this check.)
- **Radii scale with the box:** ≤20px tall → 4px, ≤34px → 8px, cards → 10px, modals → 14px, anything pill-shaped → 999px.
- **Density:** dense control rows use 7–9px gaps; content regions use 8/12/16. When in doubt, 12px.
- **Grouped repeats tighten:** consecutive same-author bubbles tighten inner corners to 4px and drop to 2px vertical gaps; the group's last item carries the tail. Generalise this to any repeated element that belongs to one act.
- **Mono is semantic, not decorative.** Fira Code means "this is a literal the system will interpret": paths, commands, percentages, counts, tokens. Never for prose, never for emphasis.

---

## 7. Anti-goals — deliberate choices, please don't "fix" them

- **No bubbles on agent turns.** Agent output carries code, diffs, tool cards; a bubble around them wastes 2×13px of horizontal space per nesting level and fights the card borders. Prose + a 32px indent is the choice. (Confirmed to match the live app.)
- **No entrance animations.** Not on messages, not on cards, not on the modal. Motion is reserved for genuinely live state (three keyframes only: pulse, spin, wave). A tool that animates on every message becomes exhausting by hour two.
- **No gradients, no glows, no coloured shadows.** Depth comes from the lightness ladder and hairlines.
- **No avatars for the operator.** You know who you are. The agent gets a mark because there may be several agents.
- **No fixed-dark code surface.** Code follows the theme. (This reverses an earlier direction in the repo docs; it was decided deliberately after seeing a dark block on warm paper.)
- **No date/day grouping headers in the sidebar.** The list is short and running-first ordering matters more than chronology.
- **No unread count on the app title / no badges beyond the row.** This is a single-operator tool; there is no inbox to triage.
- **No "show more" on long agent turns.** Reading is the point.
- **No accent focus ring on the upload caption** — the dialog autofocuses it, so a teal ring makes every upload read as active. It focuses neutral. (This one looks like an inconsistency and is not.)
- **No middle-ellipsis anywhere except the workdir.**

---

## 8. Where I was genuinely uncertain

Flagging these so you know they are soft, not load-bearing:

1. **Usage thresholds (<50 / 50–84 / ≥85).** Invented. They should probably differ per meter — ctx at 85% is urgent, a weekly limit at 85% on a Friday is fine. If you make them per-meter, the design does not fight you.
2. **The 2×2 usage grid vs one row of four.** Close call. 2×2 won because ctx deserves the top-left position, but a single row of four thin bars is defensible if the header ever gets busier.
3. **Session list ordering** (running-first) interacts badly with pinning — a pinned idle session sorts below a running one. I did not resolve this; product call.
4. **Subagent rows in the sidebar *and* pills under the header** is arguably redundant. I kept both because they answer different questions ("what exists" vs "what's working right now"), but if one goes, drop the sidebar rows.
5. **The mic's position** (right of the textarea, left of send) assumes voice is a frequent input. If it is rare, it belongs left with attach.

---

## 9. What I'd want to know before the next round

Nothing in this file is a substitute for these, and their absence is what made me guess:

- **Real transcripts** — my fixtures are plausible, not real. Real ones would have told me the true distribution of turn lengths, tool-call density, and how often a turn is only a diff.
- **The bridge payload schema** for limits/status, so labels and units are derived rather than mapped.
- **Frequency data** on which controls you actually use — that is what should drive the order-of-sacrifice list above, rather than my inference.
