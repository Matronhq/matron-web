# Token mapping: Mac app values → matron-web `design-tokens.css`

Seed for phase 2 ("Mac leads"). Left column is the web token as it exists today in
`docs/design/redesign-v5/design-tokens.css` (and `design-tokens.json` for spacing, radii and
components). Right columns are what the Mac app actually renders, taken from
[`mac-token-inventory.md`](mac-token-inventory.md) (source citations there) and, where the Mac
uses a system semantic colour, the value **measured from the audit screenshots** on macOS 26
(marked *measured*; these depend on the OS appearance and are not constants in the source).

Legend for the "Phase 2" column:
- **adopt** — write the Mac value into the web token.
- **derive** — the Mac has no fixed value (system material, semantic colour); pick a web value that matches the rendered result.
- **keep** — web has a value the Mac lacks; keep it, but re-tune it against the Mac palette.
- **decide** — genuinely different design decisions; needs Dan's call.

## 1. Colour

### 1a. Surfaces

| Web token | Web light | Web dark | Mac value (light) | Mac value (dark) | Phase 2 |
|---|---|---|---|---|---|
| `--m-app` (window background) | `#f4f2ee` | `#121316` | `NSColor.windowBackgroundColor`; *measured* `#F6F6F6`–`#FFFFFF` (missions dashboard, mission page, settings `#F7F7F7`) | *measured* `#1E1E1E` (mission page, sign-in), `#2B3033` (dashboard), `#2B2F31` (settings) | derive. The Mac uses the OS window colour, which is neutral grey, not the web's warm cream. The web's warm tint comes from the redesign-v5 palette; the Mac's only warm surface is the chat timeline. |
| `--m-paper` (message canvas) | `#efece6` | `#151619` | `MatronTimelineBackground` gradient `#F2F0EA` → `#E8E5DC` | `#1D1B18` → `#171512` | **adopt** as a two-stop gradient (`--m-paper-top` / `--m-paper-bottom`), or adopt the midpoint `#EDEBE3` / `#1A1815` if a flat colour is preferred. This is the Mac's signature warm surface. |
| `--m-panel` (sidebar, header, composer, cards) | `#ffffff` | `#1a1c20` | Agent bubble / composer field / cards: `matronBubbleBot` `#FFFFFF` | `#262421` | **adopt** for cards, bubbles and the composer field. |
| sidebar background (no separate web token; uses `--m-panel`) | `#ffffff` | `#1a1c20` | System sidebar material (`.listStyle(.sidebar)`); *measured* `#E6E4DE` rail, `#E4E3DC` list | *measured* `#2A2926`–`#323639` | derive. The Mac sidebar is a translucent material; the closest flat value is the measured one. Note the Mac rail and list are darker than its chat canvas; on the web the sidebar is lighter than the canvas. This inversion is the biggest single "feel" difference. |
| `--m-raised` (inset areas in cards) | `#faf8f4` | `#212429` | Tool/diff inner code: `NSColor.controlBackgroundColor`; table header tint `labelColor @ 0.05` (*measured* `#F3F3F3`) | *measured* `#24221F` | derive. |
| `--m-overlay` (modals, popovers) | `#ffffff` | `#282c32` | `.regularMaterial` (slash palette, popovers) | same | derive; the Mac uses blur materials, the web should keep a flat colour with `--m-sh-md`. |
| `--m-subtle` / `--m-subtle2` | `#f2efe9` / `#eae5dd` | `#212429` / `#282c32` | Search field (*measured* `#EAE8E3`), selected sidebar row `#E9E7E2`, settings groups `#FFFFFF` on `#F7F7F7` | `#323639`, `#2C2B29` | derive from the measured values. |
| terminal / code block surface (web: none; code follows the theme) | — | — | `TerminalStyle.background` `#1F1F1F` in **both** themes; foreground `#DBDBDB`; hunk header `#8C8C8C` | same | **decide**. The Mac renders diff and tool output on a fixed dark terminal block in light mode; the web tints rows on the panel colour (`--m-diff-add` / `--m-diff-del`). See §2 of the README. |

### 1b. Text

| Web token | Web light | Web dark | Mac | Phase 2 |
|---|---|---|---|---|
| `--m-ink` | `#1b1815` | `#e7e4df` | `labelColor` (black @ 85% → *measured* `#262626` on white) / white @ 85% | derive; the web's warm near-black is close. |
| `--m-ink2` | `#6b655c` | `#9a948b` | `.secondary` (`secondaryLabelColor`, black @ 50%) | derive. The Mac's secondary is neutral grey and lighter than the web's warm brown-grey. |
| `--m-ink3` | `#9a938a` | `#6d675f` | `.tertiary` (black @ 26%) | derive. |
| placeholder | uses `--m-ink3` | | `placeholderTextColor` | derive. |
| link | `--m-accent` | | `controlAccentColor` (system accent) + underline | **decide** with the accent (below). |

### 1c. Accent and selection

| Web token | Web light | Web dark | Mac | Phase 2 |
|---|---|---|---|---|
| `--m-accent` | `#0d9488` (teal) | `#2dd4bf` | **Two accents.** System accent (`controlAccentColor`, blue on Dan's Mac, *measured* `#4784F4` on the selected rail entry, `#3472E3` dark) for links, badges, send button, selection, subtask cards, running-subagent pills. Brand teal `matronAccent` `#0B6E7D` / `#6ECDDC` only for ask-user answer chips, the slash-palette selection and the drop overlay. | **decide**. The web is consistently teal; the Mac is mostly system-blue with teal reserved for "answer" affordances. Either the Mac adopts `matronAccent` app-wide (then the web keeps teal and only re-tunes it to `#0B6E7D`), or the web moves to a blue accent. Recommendation: Mac adopts its own brand teal everywhere; web adopts `#0B6E7D` / `#6ECDDC`. |
| `--m-accent-deep` | `#0f766e` | `#14b8a6` | none (no pressed shade defined) | keep. |
| `--m-on-accent` | `#ffffff` | `#0b201c` | white on badges | keep. |
| `--m-self` (operator bubble) | `#e6f4ef` | `#123530` | `matronBubbleMe` `#C4F5FB` | `#123A41` | **adopt**. |
| `--m-selected` (selected row) | teal @ 10% | teal @ 14% | System list selection (sidebar rows, *measured* `#E9E7E2` unfocused); nav-rail entry `accentColor @ 0.18`; memories row `accentColor @ 0.18` (*measured* `#CDDAF0`) | | derive after the accent decision. |
| `--m-hover` | black @ 5% | white @ 6% | chat row hover `gray @ 0.08`; slash-palette row `primary @ 0.06` | | **adopt** `rgb(128 128 128 / 0.08)` for rows. |
| `--m-active` | black @ 9% | white @ 10% | none | keep. |
| `--m-selection` (text selection) | teal @ 20% | teal @ 26% | `selectedTextBackgroundColor` (system) | keep. |
| focus ring | `2px solid --m-accent` | | system focus ring | keep. |

### 1d. Status and semantic colours

| Web token | Web (both themes) | Mac | Phase 2 |
|---|---|---|---|
| `--m-green` | `#34c759` | `Color.green` (system; `#34C759` light / `#30D158` dark) | keep, but add dark variants like the system does. |
| `--m-amber` | `#ff9500` | `Color.orange` (`#FF9500` / `#FF9F0A`) | same. |
| `--m-red` | `#ff3b30` | `Color.red` (`#FF3B30` / `#FF453A`); needs-you pill *measured* `#EC5A54` | same. |
| `--m-crit` | `#bd2020` / `#ff6a6a` | none; the Mac uses `.red` | keep. |
| `--m-diff-add` / `--m-diff-del` | green @ 13% / red @ 9% row tints | `#73D173` / `#E65959` **text** on the `#1F1F1F` terminal block | **decide** (see terminal surface above). |
| usage meters | `<50` green, `50–84` amber, `≥85` red; track black @ 12% | `<50` green, `<80` orange, else red; track `primary @ 0.2` | adopt the Mac thresholds (`80`, not `85`) or align the Mac; one of the two. |
| item kinds | question/task/decision use the same glyph set | question `.orange`, task accent, decision `.purple`; mission page overrides to question `.red`, task `.blue`, decision `.orange` | **decide**: the Mac itself is inconsistent here (rail/rows vs mission page). Pick one set and use it on both clients. |
| needs-you badge | amber pill `?` + count | `Color.orange` capsule (sidebar) but `Color.red` pill on the missions dashboard | same inconsistency on the Mac; pick one. |
| box / session chips | none on web (rows show `B:de ↔ T:87` in plain text) | 10-hue palette hashed by box name, fill @ 0.18, text mixed toward black 0.35 / white 0.3 | **adopt** on the web (new tokens `--m-box-*`). |

### 1e. Shadows and lines

| Web token | Web light | Web dark | Mac | Phase 2 |
|---|---|---|---|---|
| `--m-line` | `#e7e2d9` | `#2a2d33` | `separatorColor` (black @ 10%); card borders `primary @ 0.10`; table borders 0.5pt | derive; the Mac's hairlines are neutral and translucent. |
| `--m-line2` | `#d8d1c5` | `#3a3f46` | none | keep. |
| `--m-sh-sm` | `0 1px 2px black@6%` | `0 1px 2px black@30%` | bubbles: `matronBubbleShadow` (`rgb(18,16,14) @ 0.08`) radius 1, y 1; cards/composer: radius 2, y 1 | **adopt** `0 1px 1px rgb(18 16 14 / 0.08)` for bubbles and `0 1px 2px rgb(18 16 14 / 0.08)` for cards. The Mac keeps the same shadow in dark mode. |
| `--m-sh-md` | `0 4px 12px black@10%` | `black@40%` | slash palette `black @ 0.18` radius 10, y 3 | adopt `0 3px 10px rgb(0 0 0 / 0.18)`. |
| `--m-sh-lg` | `0 16px 48px black@16%` | | none (sheets are native) | keep. |
| floating buttons | — | | `black @ 0.15` radius 4, y 2 | adopt for the jump-to-bottom button. |
| scrim | `rgb(18 16 14 / 55%)` | | native sheets | keep. |

## 2. Typography

The Mac uses the system font (SF Pro / SF Mono). The web uses Inter / Fira Code. Sizes below are
points on the Mac and CSS px on the web (both are 1:1 at 1× and the audit screenshots are 2×).

| Web role | Web value | Mac equivalent | Phase 2 |
|---|---|---|---|
| font family UI | Inter | SF Pro (system) | **decide**: `-apple-system, BlinkMacSystemFont, Inter, …` on the web would render SF on Macs and Inter elsewhere. Recommended. |
| font family mono | Fira Code | SF Mono (system monospaced) | same: `ui-monospace, SF Mono, 'Fira Code', …`. |
| `--m-font-body-md` | 400 14px / 22px | chat body 14.3pt, paragraph spacing 8, line spacing 0 (≈ 1.2 leading ≈ 17pt) | adopt 14px / 18px; the Mac's leading is much tighter than the web's 22px. |
| `--m-font-body-sm` | 400 13.5px / 20px | 13pt body (cards, items, banners) | adopt 13px / 17px. |
| `--m-font-body-xs` | 400 13px / 16px | 12pt callout | adopt 12px / 16px. |
| `--m-font-title-lg` | 600 15px / 20px | headline 13pt semibold (pane headers, chat title); mission-page title 26pt bold; item title 22pt semibold | decide per surface; see README §Tracker. |
| `--m-font-title-md` | 600 14px / 19px | sidebar row title 14pt regular (**not** semibold; bold only on unread) | adopt: sidebar row title 14px 400, 600 when unread. |
| `--m-font-title-sm` | 600 13px / 17px | `.body.weight(.medium)` 13pt (item/mission rows) | adopt 13px 500. |
| `--m-font-label-*` (13 → 10px) | 500 | sidebar snippet/time 12pt regular; captions `.caption` 10pt, `.caption2` 10pt; nav rail label 10pt | adopt: preview 12px 400, meta 10–11px 400. The Mac uses weight 400 where the web uses 500. |
| `--m-font-meta-*` (12 → 10px) | 400 | timestamps `.caption2` 10pt secondary | adopt 10px for bubble timestamps, 11px for row meta. |
| `--m-font-badge-count` | 600 10px / 18px | `.caption2.semibold` 10pt on an accent capsule | matches. |
| `--m-font-mono-command` | 500 12.5px / 18px | tool card title `.callout` mono **bold** 12pt; args `.caption` 10pt | adopt 12px 700 title + 10px 400 args. |
| `--m-font-mono-code` | 400 12px / 19px | code block 12pt mono; tool/diff body `.caption` mono **10pt** | adopt 12px / 16px for code blocks; **decide** whether diff/tool bodies drop to 10px like the Mac (dense) or stay 12px. |
| `--m-font-mono-inline` | 400 12.5px / 18px | inline code body × 0.92 ≈ 13.2pt | adopt 13px. |
| `--m-font-mono-filename` | 600 12.5px / 18px | diff filename `.callout` mono bold 12pt | adopt 12px 700. |
| `--m-font-mono-usage` | 400 10.5px / 13px | usage bars 9pt; header vitals `.caption2` 10pt | adopt 10px. |
| composer | 14px | 13pt body | adopt 13px. |
| sign-in title | `h1` (web ~26px 700) | `.title2.semibold` 17pt | adopt 17px 600. |
| tracker item body | 14px | 16.25pt with line spacing 4 (reading measure) | adopt 16px / 24px in item detail. |
| memory name | 14px | `.body.medium.monospaced` 13pt | adopt 13px 500 mono. |

## 3. Spacing

Web has a 12-step scale (`space.scale` in `design-tokens.json`: 2, 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20). The Mac has no scale; its values cluster on 4/8/10/12/14/16/20/32.

| Region | Web (`space.regions`) | Mac | Phase 2 |
|---|---|---|---|
| Sidebar width | resizable, `--mj-left-panel-width` | list 260 / 400 / 600 + rail 72 (min / ideal / max) | adopt 400 default, 332 min. |
| Sidebar row | 9px 10px, glyph gap 10, title/preview gap 2, row gap 1 | padding v4 h4, HStack 8, VStack 2, hover radius 6 | adopt the Mac's tighter row (about 56px per row vs the web's 66px). |
| Sidebar header | 14px 12px 10px 14px | rail 72 wide, buttons 60×56, icon 22pt, labels 10pt | **decide**: the web has a wordmark + icon buttons; the Mac has a labelled icon rail (Coordinator / Missions / Decisions / Conversations / Memories). See README §Sidebar. |
| Search field | in sidebar list | outer h10 t4 b8; inner v7 h8; radius 6; 1pt separator stroke | adopt. |
| Chat header | 0 14px, min-height 58, gap 12 | titlebar accessory height 52; glass capsules 38 tall | adopt 52. |
| Canvas | 18px 20px 8px, max-width 860 centred | rows spacing 8, `.padding(.vertical)`, bubble max width 760, own-bubble far-edge inset 32 | adopt 760 max width and 8 row gap. |
| Bubble inner | (agent flat, operator bubble) | h12 v8; content↔time 6; avatar↔bubble 6 | adopt. |
| Cards (tool/diff) | header 9px 12px, body 10px 12px | padding 8, VStack 8, inner code padding 8 | adopt 8. |
| Prompt / request cards | 12px 14px | `.padding()` 16, VStack 16, max width 360 | adopt 16 and the 360 max width. |
| Composer | footer 8px 16px 12px, input row 6px 8px 6px 6px, textarea 1–6 rows, max 160 | `.padding()` 16 all round, HStack spacing 4, text inset 8, 1 line ≈ 32pt, max 8 lines ≈ 144, radius 10 | adopt 32 single-line height, 8-line max, radius 10. |
| Tracker item thread | (pane width) | column measure 640 centred, thread spacing 18, card padding 14, comment field max 640 | adopt 640 measure. |
| Tracker list rows | | HStack(.top, 10), glyph column 20, VStack 2, rows v6 h12, separators extended 8 | adopt. |
| Sign-in | card ~700px wide with big fields | 480×640 window, padding 32, VStack 16 / 12, logo 72, QR 200 | adopt 32 padding, 12 field gap, 72 logo. |
| Settings | popover under the settings button | separate 420×760 window, grouped form | decide (README §Settings). |
| Mission page | tracker pane, single column | max content 1300, 2-col ≥ 900, side column 0.4, gutter 32, section gap 20, card padding 20 | adopt for the web mission detail. |
| Missions dashboard | list rows | adaptive grid min 340, gap 16, card padding 14, page padding 16 | adopt (web currently has a list, Mac has cards). |

## 4. Radii

| Web (`radius`) | Web value | Mac | Phase 2 |
|---|---|---|---|
| `bubble` | 14 / 4 (grouped corners) | **8** everywhere, no grouping | **adopt 8**, drop the grouped-corner rule. |
| `card` | 10 | tool / diff / live-output 8; ask / request / subtask 12; item and milestone cards 10; mission cards 12 continuous | adopt: dense cards 8, content cards 12. |
| `composer` | 12 | 10 | adopt 10. |
| `iconButton` | 8 | nav-rail selection 8; header capsules capsule | adopt. |
| `sendButton` | 9 | circular symbol (`arrow.up.circle.fill` 22pt) | **decide**: filled square vs glyph. |
| `inlineCode` | 4 | 6 (code blocks), inline code has none on the Mac | adopt 6 for blocks. |
| `avatar` | 7 | circle 24 | adopt circle. |
| `thumbnail` | 7 | 6 | adopt 6. |
| `modal` | 14 | native sheets; slash palette 12 | adopt 12 for popovers. |
| `pill` | 999 | capsule | matches. |
| input fields | 8 (`mx_Field`) | `.roundedBorder` (≈ 5–6) | adopt 6. |

## 5. Iconography

| Element | Web | Mac | Phase 2 |
|---|---|---|---|
| Icon set | custom SVG (`src/journal/icons.tsx`) | SF Symbols | **decide**: SF Symbols are not licensed for the web. Recommendation: keep the web's SVG set but redraw the six chrome icons to match the SF glyphs the Mac uses (new chat `square.and.pencil`, tracker `checklist`, missions `flag.checkered`, decisions `checkmark.circle`, memories `brain`, coordinator `person.crop.circle.badge.checkmark`). |
| New conversation | full-width teal "New session" button | toolbar `square.and.pencil` (top-right of the sidebar) | decide. |
| Send | filled teal rounded square, arrow | `arrow.up.circle.fill` 22pt accent | adopt the circle. |
| Attach / mic | paperclip left, mic right | `plus.circle` 17pt left, `mic` 15pt right | adopt `plus.circle`. |
| Tool card status | chevron + `exit 0` badge + time | chevron + green `checkmark.circle.fill` / red `xmark.octagon.fill`; no exit badge, no duration | decide; the Mac is terser. |
| Diff card | file icon, filename, `new file` chip, +n/−n | `doc.text` / `doc.badge.plus`, filename, `new file` chip, +n/−n | matches already. |
| Theme toggle | sun/moon/system icon in the sidebar header | Appearance picker in Settings only | decide (README §Sidebar). |
| Item kinds | `?` glyph, list glyph, decision glyph | `questionmark.circle.fill`, `checklist`, `scalemass.fill` | adopt the Mac glyph shapes. |
| Milestones | dot | `person.fill` (user input) / `circle.fill` (progress) | adopt. |
| Status dots | 8px teal pulsing / `--m-line2` | 8pt green / orange / gray (`DashboardStateDot`); activity dots 6pt secondary | adopt green/orange/gray. |
