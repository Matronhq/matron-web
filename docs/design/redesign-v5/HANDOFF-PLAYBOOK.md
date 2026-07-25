# Design → coding agent: golden rules

What made the Matron exercise port cleanly, written as reusable guidance. Cite this (or paste the prompt template at the bottom) when kicking off a design exercise that a coding agent will implement.

---

## The one principle everything else follows from

**The rendering artifact is the source of truth; every other document is generated from it.**

A hand-written style guide drifts from the mock the moment either changes, and neither side knows which one lied. So: build one artifact that actually renders, then *derive* the spec from it. A coding agent can render it headless and read `getComputedStyle` — that path has zero drift by construction. Written specs exist only for what a static render cannot reveal.

Corollary: never ship a spec value you typed from memory when you could have parsed it.

---

## The ten rules

### 1. Ship a runnable artifact, not screenshots
Screenshots can't be probed, measured, or clicked. One self-contained HTML file that runs offline lets the implementing agent inspect real computed values and reach real states.

### 2. Every state must be reachable by clicking
If a menu, modal, hover card, error, or empty state only exists in your head or in a static frame, it will be invented by whoever implements it. Wire the interactions so each state can be entered and measured. Applies to: expanded/collapsed, selected, loading, empty, error, permission-granted, queue-in-progress.

### 3. Put canonical names in the DOM
Tag key components with a stable attribute — `data-spec="composer.slashPalette"` — so a headless pass maps *name → computed style* without guessing which element is which. This is the single cheapest thing you can do for handoff quality:

```js
[...document.querySelectorAll('[data-spec]')].map(el => ({ name: el.dataset.spec, cs: getComputedStyle(el) }))
```

Naming also forces you to decide what a thing *is*, which is half the spec.

### 4. Emit tokens machine-readably, parsed from the artifact
A JSON + CSS pair with colour roles (all themes), the type scale, spacing, radii, shadows. Generated, never transcribed. Include the *role* of each token ("`--m-raised`: inset areas inside cards"), not just its value — the implementer needs to know which token a new element should use, and that judgement isn't in a hex code.

### 5. Author the things a render cannot show
This is where probing genuinely falls short, so it's where hand-written prose earns its place:
- **States**: hover / active / selected / focus-visible / disabled / dragging, per component class
- **Motion**: durations, easing, what animates and — importantly — what deliberately doesn't
- **Breakpoint thresholds**, with the *measured element* named (see rule 6)
- **Layering**: the z-index ladder as a list of rungs, not scattered numbers
- **Deliberate omissions**: "focus-visible is not designed yet; implement as X" beats silence, which reads as "the designer forgot"

### 6. Name what drives responsive behaviour, not just the numbers
"Collapses below 760" is ambiguous and usually gets implemented as a viewport media query. "The header adapts to the *chat pane* width via ResizeObserver, because the sidebar is user-resizable and the window is often half-screen" is implementable. Say which box is measured and why.

### 7. Map new names onto the existing codebase
Read the repo's real stylesheets first and provide a mapping table (`--m-panel` → `--cpd-color-bg-canvas-default`). Without it the agent creates a parallel token system and you own two. If a token is genuinely new, mark it new.

### 8. Take a census of your own values, then normalize
Programmatically count distinct font shorthands / spacings / radii in the artifact. Ours came back with 43 font shorthands; ~10 were accidental drift (a stray `12.5px/17px`). Collapse them to a named scale *before* handoff — otherwise the agent faithfully implements your accidents as design intent.

### 9. Declare fixtures, mocks, and open items explicitly
List what is fake: mocked capture, fixture queues, invented thresholds. State the *contract* around each mock ("the transcript lands in the composer editable and is never auto-sent"). An agent can't tell a deliberate design decision from placeholder content, and will preserve the wrong ones.

### 10. Verify by probing, not by eyeballing
Before handoff, assert against the loaded page: do all custom properties resolve, do the tagged names exist, does the dark theme have real contrast between adjacent surfaces, do the interactive flows actually advance. Two of the defects in this project (an invisible dark-mode thumbnail; a corrupted `style` attribute that silently dropped a flex layout) were invisible in review and obvious under measurement.

---

## Things worth specifying that people usually forget

- **Dark mode as a lightness ladder**, with the surface order written out — not "invert the light theme".
- **Minimum sizes** and where the floor is allowed (10px only on a timestamp, body never below 12px).
- **Truncation policy**: what ellipses, and how the full value is recovered (title attr vs designed popover).
- **Grouping rules** for repeated elements (consecutive-message corner radii, row rhythm) — the "algorithm", not just the picture.
- **Which surface code lives on** in each theme.
- **Empty and overflow behaviour**: zero sessions, 200 sessions, a 400-line diff, a filename that doesn't fit.

---

## Prompt template

> Design **\<thing\>** as one cohesive, runnable artifact — a single HTML file I can click through, not a component library and not static frames. Ground it in \<repo/design system\>: read the existing stylesheets and reuse their palette and token names where possible; provide a mapping table for anything new.
>
> Cover \<screens\>, in light and dark, as one system. Dark must be a lightness ladder, not an inverted light theme. Every state must be reachable by clicking: \<list the states\>.
>
> This will be implemented by a coding agent, so alongside the design deliver:
> - `design-tokens.json` + `.css` — colour roles per theme, type scale with the intent of each role, spacing, radii, shadows — **parsed from the artifact, not hand-written**
> - `data-spec="…"` canonical names on key components so the implementation can be probed headlessly
> - A spec covering what a render can't show: hover/active/selected/focus-visible/disabled states, transitions and easings, exact breakpoint thresholds *and which element's width drives them*, the z-index ladder, and anything deliberately not designed yet
> - An explicit list of fixtures, mocks, and open decisions, with the contract around each
>
> Before handing off, take a census of distinct font/spacing/radius values, normalize the outliers into a named scale, and verify by probing the loaded page — not by eye.

---

---

## Rule 11 — export the generative system, not just the artifact

Everything in rules 1–10 describes *what the artifact is*. It does not carry the rules the designer was applying, which is what lets an implementer extend the system to screens nobody drew and to real data nobody mocked. That gap is where live re-diverges from design after handoff.

Ask for, as its own document:

1. **Responsive priority — the order of sacrifice.** Not "collapses below 760" but the ordered list: what degrades first, second, third, and what is never sacrificed, per region.
2. **Content ranges + overflow per element.** What length was assumed, and the required behaviour beyond it: 200-char titles, zero rows, a 4000-line diff, a turn that is only an image, a filename with no extension.
3. **Accessibility intent.** Tab order, focus restoration per dismissal, what is `aria-live` and at what politeness, screen-reader text for visual-only state, touch-target floors. Designers decide these implicitly and never write them down.
4. **Transition choreography** — the sequences between the still frames, including what deliberately does *not* animate.
5. **Component parameter space** — every variant × size × state × content combination and which are valid. This is what separates a system from a set of screens.
6. **Derivation rules** — how to pick a surface, a colour, a radius, a gap for something new, so extensions look native.
7. **Anti-goals and rejected alternatives** — so nobody "fixes" a deliberate choice.
8. **Where the designer was uncertain** — flags the soft decisions so they can be changed without fear.

The efficient way to get all of it: don't hand the designer this list. Ask for a **reflection pass**: *"Walk back through building this. Enumerate every decision you had to make that a static render plus tokens don't capture — priorities, rules, intent, what you rejected, the content ranges you assumed. Anything you'd have to re-explain to an agent building a screen you didn't draw."* That surfaces the load-bearing decisions nobody would have thought to ask for.

## Two axes of "done"

Split implementation status into **does the code exist** and **does it match the design**. A component can be fully implemented and visually divergent, and that combination hides from both a "already built" list and a "gaps" list. Anything not determinable by reading should be marked *unverified* and settled by measuring, not by judgement.

## Definition of done

- [ ] Artifact runs standalone and offline; every state reachable by clicking
- [ ] Tokens generated from the artifact, both themes, roles documented
- [ ] Canonical `data-spec` names present and verified in the DOM
- [ ] States, motion, breakpoints (with the measured element named), layering written down
- [ ] Mapping onto the target repo's existing tokens
- [ ] Value census taken and outliers normalized
- [ ] Fixtures, mocks, and open items listed with their contracts
- [ ] Probed, not eyeballed: tokens resolve, names exist, flows advance, dark-mode surfaces separate
- [ ] Generative system exported (order of sacrifice, content ranges, a11y intent, choreography, parameter space, derivation rules, anti-goals, uncertainties)
- [ ] Status split into exists-vs-matches, with unresolved items marked for measurement
