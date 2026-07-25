# Fonts in the static states

Each state file links Inter + Fira Code from the Google CDN and carries a commented
`@font-face` block at the top of its `<style>`.

**For probing, do nothing.** Computed values resolve regardless of which face loads —
every size, weight, and line-height in this design is authored as an absolute value,
not derived from font metrics.

**For screenshot-faithful offline renders**, self-hosting is a two-step:

1. Put `Inter.woff2` and `FiraCode.woff2` in `static/fonts/`.
2. Uncomment the `@font-face` block in the state files you render:
   `sed -i 's|^/\*$||; s|^\*/$||' static/*.html` — or just delete the `/*` and `*/` around it.

matron-web ships no font files at `main` (checked: zero `woff2?`/`ttf` in the tree),
which is why they could not be embedded here. If the app later self-hosts, point the
`src` at the repo path instead and this becomes a one-line change.
