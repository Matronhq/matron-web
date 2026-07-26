# redesign-v5 — Matron UI design package

Drop-in for `docs/design/redesign-v5/`. Every file is under 256 KiB, so it also survives a per-file MCP pull.

## Start here, in this order

1. **`CHANGELOG-vs-current.md`** — read at `origin/main` tree `eb6e7d6f3c4b`. Leads with what has ALREADY landed (do not redo), then the real divergences.
2. **`component-map.json`** — `data-spec` → `src/journal` selector, each marked `implemented` / `new` / `devtool`.
3. **`static/index.json`** → **`static/*.html`** — 20 runtime-free states. Measure these; do not eyeball screenshots.
4. **`design-tokens.json`** / **`.css`** — tokens, 27 type roles, states, breakpoints, layering, content-type specs, exact copy strings, usage relabel map.
5. **`BRIDGE-PAYLOAD-PROPOSAL.md`** — concrete payload changes that would remove the client's string-parsing workarounds. Additive and non-breaking (`payload.body` stays for text clients). §1 (queued prompts) and §3 (usage limits) are where the design pays the most tax today.
6. **`GENERATIVE-SYSTEM.md`** — the rules behind the values: order of sacrifice as the pane narrows, assumed content ranges + overflow behaviour per element, accessibility intent, transition choreography, each component's full parameter space, derivation rules for extending the system, deliberate anti-goals, and where I was genuinely uncertain. **Read this before building any screen the mock doesn't show.**
7. **`tools/probe.js`** — dumps computed values for every tagged specimen (design side) or every mapped selector (live side). Feed both into your auto-diff.

`Matron Redesign.dc.html` (+ `support.js`, `res/`) is the interactive source of truth if you need to click through something the static files don't cover. `DESIGN-SPEC.md` is the narrative; `HANDOFF-PLAYBOOK.md` is the general contract for future design rounds.

## `static/` is self-contained

Every asset the state files reference lives under `static/` — `fonts/` (Inter + Fira Code, OFL) and `res/matron-logo-simple.svg` (brand mark, referenced 3× per file). Open any state file straight from disk and it renders complete, offline, with no CDN and no missing images. `static/index.json → assets` lists them; keep it that way if you regenerate.

## Probing

```js
const state = document.querySelector('meta[name=matron-state]').content;
[...document.querySelectorAll('[data-spec]')].map(el => {
  const cs = getComputedStyle(el);
  return { name: el.dataset.spec, target: el.dataset.target, font: cs.font,
    color: cs.color, background: cs.backgroundColor, border: cs.border,
    radius: cs.borderRadius, padding: cs.padding,
    hover: el.dataset.styleHover, focus: el.dataset.styleFocus };
});
```

`data-style-hover|active|focus` carry designed pseudo-state declarations as CSS text — a static file can't be hovered, so they are exposed as data instead.

## Two axes of status in `component-map.json`

`status` answers *does the code exist* (`implemented` / `new` / `devtool`). `visual` answers *does it match the design* (`aligned` / `divergent` / `unverified`). They are independent: **6 entries are implemented-but-divergent** — e.g. `sidebar.newSession` (a bare pencil icon where the design has a full teal button) — which neither the changelog's "do not redo" list nor its divergence list would have caught. **24 are `unverified`**: not determinable from reading source, deliberately left for the auto-diff rather than guessed at.

## Confirmed decisions

- **Agent turns are flat prose**, operator turns are teal bubbles. The live app already does this — no work.
- **The fable bar is omitted until the bridge sends that limit.** Never render an empty track. Labels are fixed short strings (`ctx` / `fbl` / `5h` / `wk`) via the client-side relabel map in `design-tokens.json → components.usageMeter.labelMap`, because the bridge's long labels truncate in a 24px column.
- Usage thresholds `<50` / `50–84` / `≥85` are already shipped in `status.ts` — unchanged.

## Do NOT implement

`data-spec="devtool.stateMatrix"` (the dashed **states** button in the mock's sidebar footer) and `data-spec="gallery"` (the state-matrix surface). Both exist only to make states probeable.

## Still open

**Nothing on the design side.** All five §8 uncertainties are resolved (flat %-based thresholds across all meters, 2×2 grid, pins-at-top then running-first, keep both subagent surfaces, mic stays right of the textarea). The fable limit's semantics and its bridge wiring remain product/plumbing work; the design renders correctly with or without it.

Outstanding input is data, not judgement: real (or redacted) transcripts, and control-frequency data — the latter would replace my inferred order-of-sacrifice in `GENERATIVE-SYSTEM.md` §1 with fact.

---

## Round 2 — four surfaces (2026-07-26)

Prompt/Question card, new-session sheet, conversation-actions menu, and the upload modal, all derived from the existing patterns rather than newly invented.

**Read `GENERATIVE-SYSTEM.md` §10 first.** It states the six cross-cutting invariants these surfaces obey — content-width policy, the two-left-edges/one-right-edge alignment grid, section-spacing rhythm, both-theme parity *including native chrome*, one-primary-per-surface, and the menu component/anchor rule. That section is the part that leaked last round: the mock carried the rules, the documents didn't, so the implementation reproduced the layout and lost the reasoning.

New static states: `light|dark-new-session`, `light|dark-new-session-filled`, `light|dark-actions-menu`, `light|dark-round2` (all four surfaces on one grid, prompt card in both states, upload single-vs-multi side by side). 28 states total.

### What the live screenshots showed, and the rule behind each fix

| Observed | Rule it breaks |
|---|---|
| Prompt card: *Cancel* and *Send now* both outlined | §10.5 — one primary per surface. Send now is the only filled button. |
| Prompt card: inline emoji (📨 ⚡ ✓) prefixing body lines | §10.2 — glyph width makes the left edge variable, so no two rows align. SVG in a fixed 24px gutter instead. |
| Prompt card: timestamp floating bottom-right below the content | §10.2 — one shared right edge, on the label row, same line every message type uses. |
| New session: title right-aligned, "Close" as a text link | §10.2/§10.3 — upload-dialog shell: left title + icon, X close, header rule. |
| New session: workspace field sitting above the "Folder path" label | §10.3 — a label binds to the field *below* it at the small gap. Each field gets its own label. |
| New session: "Agent default" input white-on-dark | §10.4 — an unstyled native input inherits *UA* white, not the theme. Background, colour and border are all set explicitly; disabled uses `--m-subtle`/`--m-ink3`, never opacity alone. |
| Actions menu: browser-blue focus ring | §10.4 — focus is always `2px solid var(--m-accent)`, and a global `:focus-visible` rule is the floor. |
| Actions menu: full-width rows touching the shell edge, gaps between them, no separator before Archive | §10.6 — 4px-padded shell, row radius < shell radius so hover insets, hairline groups. |
| Upload modal: raw filename as the modal title, no file-info row / strip / counter | §10.1/§10.2 — title is always `Send file`; the filename lives in the file-info row under the preview. |
| Unstyled horizontal scrollbar crossing a dark modal | §10.4 — scrollbars are themed via `--m-scrollbar` / `--m-scrollbar-hover`. |

**Sidebar ⋯ removed** per the operator's call: sidebar rows are right-click only, so the row keeps its fixed columns (status glyph, name, time, badge) at every width. The header ⋯ is the only persistent trigger, and both anchors mount the same menu component.

Three new tokens: `--m-scrollbar`, `--m-scrollbar-hover`, `--m-selection`.

### Publishing

No DesignSync tool is exposed in this canvas session, so the package ships as the zip in chat (and as `redesign-v5/` in the project). `from-coding-agent/` is created and ignored on my side — drop auto-diff output there and I'll read it next round. If you'd rather I publish directly, wire the connector and I'll push instead of exporting.

### Two more surfaces (2026-07-26, later)

**Message context menu** (right-click a turn) and the **event source viewer**. New states: `light|dark-message-menu`, `light|dark-event-source`; both also appear in `*-round2` as sections 5 and 6. 32 states total.

The menu is the *same component* as the conversation-actions menu — that is now a written rule (§10.7), along with two item rules the live version breaks: every row carries an icon (otherwise the menu has two label edges), and groups are separated by a hairline rather than a gap, with the diagnostic item below it. `Copy as Markdown` is a proposal, not a requirement — drop it if the bridge only stores rendered text.

The source viewer gets §10.8: read-only viewers state their own limits. It uses the wider 720px shell (it holds code, not a form), lifts seq/sender/timestamp/convo into a labelled meta grid so finding a timestamp doesn't mean reading braces, puts the JSON in a bordered `--m-raised` well capped at 46vh with themed scrollbars, and states the payload size in the footer so truncation is visible. One primary: `Copy JSON`. The live version's blank second footer button should simply not exist.

### Selector corrections (2026-07-26, after review)

Re-read `src/journal` at tree `f661b266f772`. Two round-2 entries had asserted `.mj_ContextMenu` as their selector — **that class does not exist**; it was inferred, not read. Corrected against source:

| data-spec | real selector |
|---|---|
| `menu.conversationActions` | `.mj_RoomItemMenu` / `.mj_HeaderMenu.mj_RoomItemMenu` |
| `menu.messageActions` | `.mj_EventRowMenu` |
| `menu.item` (shared by both) | `.mj_RoomItemMenu_item` |
| `sidebar.rowMenuTrigger` | `.mj_RoomItemMenu_trigger` |
| `modal.eventSource` | `.mj_EventSource` + `_scrim` / `_header` / `_json` / `_actions` |

`component-map.json` now carries `repo.tree` and a `selectorProvenance` note, and §10.9 makes the rule explicit: an unread selector is `status: new` with a `suggested` name, never asserted. Anything not determinable from CSS is `unverified` for the auto-diff.

**Much of round 2 is already implemented** — `journal.pcss` quotes the §10.6/§10.7 rules verbatim and the menus genuinely share one item class. Remaining real divergences are concentrated in the event-source viewer (not yet on the modal shell: no border/shadow, bare `<pre>` at 14px with unstyled scrollbars, header without rule/chip/close, actions without the primary treatment) and its scrim sits at `z-index: 100` where every other modal scrim is `50`.

**Two things where live is better or already settled, and the design defers:**
- `.mj_RoomItemMenu_trigger` — invisible and non-interactive for pointer users, visible on `:focus-visible`. Keeps a keyboard/AT route the design had dropped. Adopted.
- `.mj_RoomItemMenu_item` is `padding 7px 8px` / `500 12.5px/16px` / 16px icons where my specimen was `7px 9px` / `400 13px/17px` / 15px. Live is internally consistent and shipped — **pick one and make it canonical**; my recommendation is to keep live and I will fold those values into the next token regeneration.

Scrollbar pseudo-boxes are now scoped to real scroll containers instead of `*` (same rendering, much cheaper in a large DOM).

### Queue card refinement (2026-07-26)

Three fixes, now written as §10.10 (*the card owns its chrome; the payload supplies only content*):

1. **Two envelopes.** The payload body arrives as `📨 Queued (1): …` and the card adds its own gutter icon, so the live card shows two envelopes in a row. Strip the leading emoji run and the `Label (n):` prefix on arrival — the same rule as §10.2's ban on inline emoji, which the payload was bypassing.
2. **Count is a chip, not prose.** `Queued` + a mono count pill on the label row; the body is then only the question.
3. **Quoted text clamps to 3 lines, never ellipses at one.** `…i see a sub agen…` cannot answer the only question the operator has — *what am I about to send?* Quote it with a 2px left rule and clamp to three lines.

The **released** state stays on the card and only re-inks (resolution line, rule, quote → tertiary): no reflow, and no re-emitting `📤 Sending 1 queued message:` + a numbered list as bare thread prose, which duplicated the card's content and reintroduced payload-emoji-as-chrome one message lower.

### Subagent escape (2026-07-26)

A "back to the parent conversation" affordance in the subagent strip, written up as §10.11.

The load-bearing detail: **live's `.mj_SubagentStrip` is itself `overflow-x: auto`**, so a back button placed in it would scroll away exactly when there are enough subagents to get lost among — the moment you most need it. The design splits the strip into a non-scrolling row: **pinned back chip → hairline → an inner `overflow-x` container holding the label + pills.** Only the pills move.

**The header names the child; the chip names the parent.** An earlier draft left the parent in the header *title* while the chip also offered to return there, so the mock offered to navigate you to where you already were — naming a destination only informs if the current context is named something else. Inside a subagent the header now reads `↳ test triage` with a `SUBAGENT` badge and a subtitle `of matron-web · deploy · 32 tests fixed · working`.

The parent appears **twice on purpose, with two jobs**: *stated* in the subtitle as hierarchy (read-only, part of the sentence describing where you are) and *actionable* on the chip as the escape target. The rule is about which slot, not the count — what must never happen is the parent in the header **title** while the chip offers to return there. The ringed current pill drops to confirmation and sibling-disambiguation rather than the sole indicator you had descended.

Two more rules: the chip **names its destination** (the parent conversation's title, ellipsised at 220px) rather than saying just "Back"; and it reads as *leave*, not *another sibling* — same 26px pill geometry as the subagent pills, but accent ink on `--m-selected` with a left chevron. Same family, different action.

The strip now answers both questions an operator has inside a nested context: **where am I** (the current pill takes an accent border + 2px ring and stops being clickable — `.mj_SubagentPill_current` already does this in live, so the design defers to it) and **how do I get out**.

`Escape` is bound to the whole stack and unwinds **one layer per press, outermost-last**: source viewer → upload → new-session → open menu → subagent context.

New states: `light|dark-subagent-view`, plus `light-subagent-narrow` at an 820px pane specifically to prove the escape stays pinned while the pills scroll. 35 states total. The dashed "open subagent" chip in the mock is a devtool to make the context reachable by clicking — `data-spec="subagentStrip.enter"`, do not implement.
