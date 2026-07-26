# Matron redesign — round 2: four more surfaces

> Coding-agent → design brief. Paste into the claude-design canvas session (attach the four
> reference screenshots alongside — each is described below so the brief stands on its own).

This continues the Matron journal-client redesign (redesign-v5, now shipped live). Four more
surfaces need design. **Extend the existing redesign-v5 system** — same tokens, same
event/modal/menu patterns — do not invent a new visual language. Where a surface reuses an
existing pattern (modals like the upload dialog, event cards, menus), derive from that pattern.

## Ground it in the repo

The client is `easelyte/matron-web` at `/opt/matron/web-journal`. The design package is
`docs/design/redesign-v5/` (`design-tokens.json`/`.css`, `component-map.json`, `static/`,
`GENERATIVE-SYSTEM.md`). Read the live stylesheets (`src/journal/journal.pcss`,
`src/journal/shell.pcss`) and the redesign-v5 tokens first; reuse the `--m-*` colour ladder and
existing component classes, and provide a mapping for anything genuinely new.

## The four surfaces

1. **Prompt / Question card** (`event.prompt`). Currently ragged — the label (`QUESTION`), the
   icon-prefixed body (`📨 Queued (1): …`), the action buttons, the answered state (`✓ Answered`
   + numbered queued-message list), and the timestamp don't share a consistent grid. Design it on
   **one alignment grid** consistent with the other event cards, covering **both states**:
   un-answered (`✕ Cancel` / `⚡ Send now`) and answered (`✓ Answered` + queued list).

2. **New session modal** (`NewSessionSheet`). Currently unstyled, and in dark theme the
   "Agent default" input renders **white-on-dark** (invisible). Design it into the redesign-v5
   **modal system** (match the upload dialog's card/header/spacing): `New session` / `Close`
   header, the "Start on \<agent\>" section, the disabled workspace field, the Folder-path input,
   the Browser-tools checkbox, and the `Start` button — all themed and legible in **both light and
   dark**.

3. **Conversation actions menu** (Pin / Add to Favorites / Mark as unread / Archive — used by both
   the sidebar row right-click **and** the header `⋯`, same component). Currently generic: the
   keyboard focus ring is browser-**blue** (should be the teal accent), and the icon/label rows
   need proper alignment and design-system spacing / hover / selected treatment.

4. **Upload modal.** Finish and refine to the canonical **Send-file** mock (the `1.58.35 PM` frame
   produced earlier): a `Send file` header with the filename in a **file-info row** (not the raw
   filename used as the modal title), the preview area, a **34px thumbnail strip** (active thumb =
   teal ring) with an "N more file queued" note, an `N of N` counter, and the themed caption field
   + `Cancel`/`Send`. Cover both single-file and multi-file states.

## Deliver the full hardened handoff (update `redesign-v5/` in place)

- **Runnable `static/*.html`** for each surface — every state reachable by clicking, both themes,
  self-hosted fonts.
- **`design-tokens.json`/`.css`** regenerated (parsed from the artifact, not typed).
- **`component-map.json`** entries: `data-spec` → real repo selector, with `status` and `visual`
  fields.
- **`GENERATIVE-SYSTEM.md`** updated with the **cross-cutting invariants** these surfaces must
  obey — this is the part that leaked last round, so state them as explicit rules, not pixels:
  - one **content-width policy**;
  - the **alignment grid** — a shared left edge for label / body / actions inside a card, and a
    shared **timestamp right edge** across message types;
  - **section-spacing rhythm** — equal gaps between stacked elements;
  - **both-theme parity including native chrome** — scrollbars, focus rings (teal, never
    browser-blue), disabled and empty states, and any theme-dependent asset;
  - and the **hard states** each surface must render (un-answered/answered, single/multi-file,
    disabled, empty, both themes).

## Publish into DesignSync

Publish into the DesignSync project so the coding agent can pull the changed files (`get_file`)
and push the auto-diff results back (`write_files` to `from-coding-agent/`). The operator keeps the
canvas as source of truth and will tweak visually there.

---

Implementation note (coding side): on receipt, run `scripts/visual/diff.mjs` as the **gate** before
anything ships — settle every `unverified` to aligned/divergent, and record any intentional
operator-accepted deviation explicitly. See `docs/design-implementation-loop.md`
(son-of-anton) → "Why fidelity still leaked" for the full hardening.
