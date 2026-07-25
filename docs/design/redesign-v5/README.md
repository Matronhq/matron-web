# redesign-v5 — Matron UI design package

Drop-in for `docs/design/redesign-v5/`. Every file is under 256 KiB, so it also survives a per-file MCP pull.

## Start here, in this order

1. **`CHANGELOG-vs-current.md`** — read at `origin/main` tree `eb6e7d6f3c4b`. Leads with what has ALREADY landed (do not redo), then the real divergences.
2. **`component-map.json`** — `data-spec` → `src/journal` selector, each marked `implemented` / `new` / `devtool`.
3. **`static/index.json`** → **`static/*.html`** — 20 runtime-free states. Measure these; do not eyeball screenshots.
4. **`design-tokens.json`** / **`.css`** — tokens, 27 type roles, states, breakpoints, layering, content-type specs, exact copy strings, usage relabel map.
5. **`GENERATIVE-SYSTEM.md`** — the rules behind the values: order of sacrifice as the pane narrows, assumed content ranges + overflow behaviour per element, accessibility intent, transition choreography, each component's full parameter space, derivation rules for extending the system, deliberate anti-goals, and where I was genuinely uncertain. **Read this before building any screen the mock doesn't show.**
6. **`tools/probe.js`** — dumps computed values for every tagged specimen (design side) or every mapped selector (live side). Feed both into your auto-diff.

`Matron Redesign.dc.html` (+ `support.js`, `res/`) is the interactive source of truth if you need to click through something the static files don't cover. `DESIGN-SPEC.md` is the narrative; `HANDOFF-PLAYBOOK.md` is the general contract for future design rounds.

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

## Still open (non-blocking)

Fable limit semantics — what it measures, its window, its reset cadence — plus the bridge wiring to emit it. Design is ready for it either way.
