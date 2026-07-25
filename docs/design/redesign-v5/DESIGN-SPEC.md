# Matron redesign — implementation spec

Companion to the visual export. Three files, different jobs:

| File | What it is | Drift risk |
|---|---|---|
| `design-tokens.json` | Colour tokens + font shorthands **parsed out of** `Matron Redesign.dc.html`, plus hand-authored states, breakpoints, layering, motion, per-component notes | Colour/type sections: none (generated). Prose sections: regenerate if the design changes materially |
| `design-tokens.css` | The same tokens as ready-to-paste custom properties, incl. `--m-font-*` type roles | none (generated) |
| `Matron Redesign.dc.html` | The rendering artifact. Also carries the tokens inline as `<script type="application/json" id="matron-design-tokens">` | it *is* the source of truth |

**Probing beats reading.** If a value here ever disagrees with the artifact, the artifact wins. Key elements carry a `data-spec` attribute so a headless pass can map canonical name → computed style directly:

```js
[...document.querySelectorAll('[data-spec]')].map(el => ({
  name: el.dataset.spec,
  ...getComputedStyle(el)
}))
```

Tagged names: `sidebar`, `sidebar.list`, `header`, `subagentStrip`, `canvas`, `composer`, `composer.slashPalette`, `composer.recording`, `card.permission`, `modal.upload`.

---

## Type scale

27 canonical roles, listed with intent in `design-tokens.json → type.roles` and emitted as `--m-font-*` in `design-tokens.css`. The scale after normalisation:

- **Inter** 600 15/20 · 600 14/19 · 600 13/17 · 500 13/17 · 500 13/16 · 600 12.5/16 · 500 12.5/16 · 500 12/16 · 600 12/16 · 400 14/22 · 400 13.5/20 · 400 13/16 · 400 12/16 · 400 11.5/15 · 500 11/14 · 400 11/14 · 600 10/14 · 500 10/14 · 400 10/14 · 600 10/18
- **Fira Code** 600 12.5/18 · 500 12.5/18 · 400 12.5/18 · 400 12/19 · 600 11/16 · 500 11/16 · 400 11/16 · 500 10.5/13 · 400 10.5/13

10px is the floor and only appears on the bubble timestamp and the unread numeral. Body copy never goes below 12px.

## Colour

Two themes, one system. Dark is a **lightness ladder** — `--m-app` `#121316` < `--m-paper` `#151619` < `--m-panel` `#1a1c20` < `--m-raised` `#212429` < `--m-overlay` `#282c32` — never an inverted light theme. Surface roles and a suggested mapping onto the repo's existing `--cpd-*` names are in `design-tokens.json → color`.

Theme is `data-theme` on `<html>`, persisted in `localStorage['matron-redesign-theme']`, defaulting to `prefers-color-scheme`.

## Responsive behaviour — read this before implementing the header

The header adapts to the **chat pane width** (ResizeObserver on the chat `<section>`), *not* the viewport. Viewport media queries give the wrong answer when the sidebar is dragged wide or the window is half/quarter screen.

| Threshold | Behaviour |
|---|---|
| pane ≥ 760 | full 2×2 usage grid (300px) |
| pane < 760 | ctx bar only; hover → 250px popover with all four meters + reset times |
| pane ≥ 560 | subtitle `model · workdir · status`; Compact button visible |
| pane < 560 | subtitle → status dot + short model name; hover title → popover with all fields; Compact hidden |
| viewport ≤ 700 | single column; sidebar/chat swap via `state.screen`; back chevron in header |

**Truncation rule:** anything that ellipses must expose its full value on hover — `title` for a single field, a designed popover wherever several collapse at once.

## States, motion, layering

Full matrix in `design-tokens.json` (`states`, `motion`, `layering`). Highlights:

- Hover on chrome = `--m-hover`; active = `--m-active`; selected = `--m-selected` + a 3px teal left bar.
- Text inputs focus by **border-color → `--m-accent`** only. No glow, no ring. Keyboard `:focus-visible` is deliberately *not* designed yet — implement as a 2px `--m-accent` outline at 2px offset rather than reusing the border treatment.
- Primary buttons hover with `filter: brightness(1.08)`; nothing translates or scales.
- Transitions are 120ms `cubic-bezier(0.2, 0, 0, 1)`. Only three keyframe animations exist (`m-pulse`, `m-spin`, `m-wave`) and all three indicate genuinely live state. No entrance animation anywhere.
- z-index: resize handle 5 · slash palette 20 · header popovers 30 · modal 50.

## Open items for implementation

1. `:focus-visible` treatment (above) — designed intent stated, values not yet in the artifact.
2. Voice capture is mocked: stop inserts a placeholder transcript into the composer. The UI contract is that the transcript is **editable and never auto-sent**.
3. The upload queue is a two-item fixture; the real flow should drive `n of N`, the thumbnail ring, and the posted chip's name/size from the actual FileList.
4. Usage-bar thresholds (<50 green, 50–84 amber, ≥85 red) are a design decision, not a repo constant — confirm before wiring.


---

## Handoff package (2026-07-25 pass)

| File | Use |
|---|---|
| `Matron Redesign.dc.html` | Editable source of truth. Interactive; carries the tokens inline. The dashed **states** button in the sidebar footer opens the state matrix (`data-spec="devtool.*"` — not a product feature). |
| `static/` + `static/index.json` | **20 runtime-free states**, one file per state. No framework loads; `getComputedStyle` returns final values. Measure these instead of screenshots. |
| `component-map.json` | `data-spec` → `src/journal` selector, each marked `implemented` / `new` / `devtool`. |
| `CHANGELOG-vs-current.md` | What already landed at tree `eb6e7d6f` vs what has not — read before implementing. |
| `design-tokens.json` / `.css` | Tokens, 27 type roles, states, breakpoints, layering, content-type specs, exact copy strings. |

### Probing recipe

```js
// in any static/*.html
const state = document.querySelector('meta[name=matron-state]').content;
const items = [...document.querySelectorAll('[data-spec]')].map(el => {
  const cs = getComputedStyle(el);
  return { name: el.dataset.spec, target: el.dataset.target,
    font: cs.font, color: cs.color, background: cs.backgroundColor,
    border: cs.border, radius: cs.borderRadius, padding: cs.padding,
    hover: el.dataset.styleHover, focus: el.dataset.styleFocus };
});
```

`data-style-hover` / `-active` / `-focus` carry the designed pseudo-state declarations as CSS text (they are not live in the static files, by design — a static file cannot be hovered).

### Content types

All nine `EventContent` branches are specified in `design-tokens.json → contentTypes`, taken from the switch in `components.tsx`: `text`, `prompt`, `permission_request`, `prompt_reply`, `tool_output`, `diff`, `image`, `file`, and the `default` unknown case — plus the outgoing `attachmentChip` with its sending / sent / error states.

### Usage labels

Fixed short labels **ctx / fbl / 5h / wk** are baked into the design and specified as a client-side relabel map (`components.usageMeter.labelMap`), because the bridge currently sends long labels that truncate. `fbl` has **no counterpart in today's payload** — omit the bar rather than render an empty track. Its semantics are an open product decision.
