# Design audit: matron-web against the Matron Mac app

Phase 1 of "unify the two clients, Mac leads". This folder holds the side-by-side screenshots,
a per-screen comparison, the Mac app's real design values, and a mapping of those values onto
matron-web's token file. Nothing here changes any styling; it is the input for phase 2.

Files:

- `screenshots/NN-screen-theme.jpg` — Mac app (left) and web app (right), same screen, same theme, both scaled to 1024 px wide. Captured 29 Sep 2026.
- [`mac-token-inventory.md`](mac-token-inventory.md) — every colour, font, spacing, radius, shadow and icon the Mac app actually uses, with `file:line` citations into matron-apple at `baa196c9`.
- [`token-mapping.md`](token-mapping.md) — those values mapped onto `docs/design/redesign-v5/design-tokens.css`, with a suggested action per token.

## How the screenshots were taken

| | Mac app | Web app |
|---|---|---|
| Build | matron-apple `main` at `baa196c9`, Debug configuration, macOS 26 | https://chat.yearbooks.be/app/ (matron-web `1.12.11-rc.0`, build `879a4a5c`) |
| Size | window 1280×860 pt (sidebar at its ideal 472 pt); the chat-with-diff shot is 1280×1080 | viewport 1280×860 CSS px; the chat-with-diff shot is 1280×1080 |
| Scale | 2× (Retina) | 2× (`deviceScaleFactor: 2`, headless Chrome) |
| Themes | Appearance override Light / Dark (Settings › General) | `matron-theme` = `light` / `dark` (the sidebar theme toggle) |
| Capture | The app's own DEBUG snapshot hook, extended locally (not committed) to capture its own window through the window server and to drive navigation from a trigger file. No Screen Recording grant was available to the unattended session. | Playwright screenshots |
| Data | The same journal (`chat.yearbooks.be`) signed in as `dan`, so both clients show the same live conversations and tracker items. The Mac build ran against an isolated data container, not Dan's installed app. | same |

Caveats that matter when reading the pairs:

- The Mac app has **no fixed accent colour**; it uses the macOS system accent, which is blue on the machine used. Every blue in the Mac shots (selected rail entry, unread badges, links, send button) is the OS accent, not a Matron choice.
- The Mac window is 72 pt of icon rail + 400 pt of list, so its chat column is about 810 pt wide at this window size; the web sidebar is about 545 px, so its chat column is about 735 px. Density comparisons below account for this.
- The timeline data is live, so the two sides of a pair are a few seconds apart and rows may differ slightly.
- The Mac Debug build signed in as a new device ("Matron Mac", device 85). It appears under Settings › Devices and can be removed.
- Colours quoted as *measured* were sampled from the 2× screenshots, so they include the OS's blending of materials; they are what the eye sees, not constants in the source.

## Summary of the differences

1. **Surface hierarchy is inverted.** On the Mac the *chat canvas* is the light, warm surface (`#F2F0EA → #E8E5DC` gradient) and the sidebar is a darker translucent material. On the web the *sidebar and cards* are pure white and the canvas is the warm cream (`#efece6`). Bubbles and cards on the Mac are white on cream; on the web agent text is flat on cream and only the operator's messages get a bubble.
2. **Accent.** Web: one teal (`#0d9488`) everywhere. Mac: OS blue for everything interactive, and its own teal (`#0B6E7D`) only for answer chips, the slash palette and the drop zone. The Mac's teal is darker and greener than the web's.
3. **Density.** Mac rows are ~40 pt; web rows are ~66 px. Mac body text is 14.3 pt with 1.2 leading; web is 14 px on 22 px. The Mac shows roughly a third more content per screen in every list and in the timeline.
4. **Radii.** Mac: 8 on bubbles, tool and diff cards; 10 on the composer and item cards; 12 on prompt cards. Web: 14/4 grouped bubbles, 10 cards, 12 composer. The Mac is uniformly squarer.
5. **Code and diffs.** Mac renders diff bodies and tool output on a fixed dark terminal block (`#1F1F1F`, green/red text) in *both* themes; the web tints rows on the card colour and keeps code in the UI theme.
6. **Navigation model.** Mac: a labelled five-entry icon rail (Coordinator, Missions, Decisions, Conversations, Memories) with count badges, plus Back/Forward history. Web: conversations list with Active/Favorites/Archived tabs, and a Tracker pane that *replaces the chat column* and has its own Missions/Inbox/Memories switch.
7. **Missions.** Mac has a card dashboard and a full mission page (Overview/Board). Web has a row list and a single-column detail.
8. **Type.** SF Pro / SF Mono versus Inter / Fira Code. Weights differ too: the Mac uses regular weight where the web uses medium (row titles, labels).
9. **Chrome the web lacks:** icon rail, box/session colour chips, count badges, Back/Forward, per-chat "Tasks & decisions" pane, "Ask the Coordinator" affordances, missions dashboard, mission Board view, Settings window (devices, link a device, Touch ID, storage, appearance, voice notes), QR device linking on sign-in.
10. **Chrome the Mac lacks:** wordmark, theme toggle in the chrome, Favorites/Archived tabs, mark-all-read, "New session" as a primary button, tool-card exit code and duration badges, composer hint row, live `ctx %` in the composer, the sidebar footer with connection state (the Mac uses a banner instead).

The rest of this document goes screen by screen.

---

## 1. Sign-in — `01-signin-light.jpg`, `01-signin-dark.jpg`

| | Mac | Web |
|---|---|---|
| Layout | 480×640 window, one centred column 390 pt wide, no card, window background (`#FFFFFF` / `#1E1E1E`) | Full-page cream background, centred white card ~700 px wide, radius 14, large soft shadow (`--m-sh-lg`) |
| Logo | 72 pt | ~80 px |
| Title | "Sign in to Matron", `.title2` semibold **17 pt** | "Sign in", `h1` ~**32 px** 700 |
| Fields | Caption label **above** each field (`.caption` 10 pt), `.roundedBorder` text field ~22 pt tall, placeholder `https://your-server.example.com` / `alice`; gap 12 | Floating label **inside** the field, outlined field ~110 px tall, radius 8, 1 px `--m-line` border, teal border on focus; gap 24; "Journal server" is prefilled with `/` |
| Button | Standard bordered button, full width, **disabled (grey) until the form is valid** | Filled teal button 60 px tall, radius 8, always enabled |
| Extras | 200 pt QR code for device linking, caption "Scan this with a phone that's signed in to Matron", "Have a link code?" link | none (web has no device linking) |
| Known bugs | — | Inputs are wider than the card (missing `box-sizing: border-box`), visible in the shot |

**Type scale.** The web is roughly 2× the Mac at every level (title 32 vs 17, field text 17 vs 13, labels 13 vs 10).
**Spacing.** Mac: 32 pt padding, 12 pt between fields. Web: 48 px padding, 24 px between fields.
**Colour.** Mac: no accent on this screen except the system-blue link. Web: teal button and teal focus ring.
**Interaction.** Mac disables the button until valid and offers two alternate paths (QR, link code). Web has one path and shows errors inline under the fields.

Phase 2 suggestion: drop the card and shadow, shrink the type to the Mac scale, labels above fields, 12 px gaps, a disabled-until-valid submit, and hide the server field when config sets it (already tracked as a matron-web follow-up).

## 2. Sidebar / conversation list — `02-sidebar-*.jpg`

| | Mac | Web |
|---|---|---|
| Structure | 72 pt **icon rail** (Coordinator, Missions, Decisions, Conversations, Memories; 22 pt symbols, 10 pt labels, red count badges, selected entry on `accent @ 0.18` radius 8) + 400 pt list | 545 px single panel |
| Header | Window title bar: Back / Forward chevrons, New chat (`square.and.pencil`) at the right | Wordmark (logo + "Matron" 20 px 600) + four icon buttons (theme, mark all read, tracker, settings); then a full-width teal-tinted **"New session"** button; then Active / Favorites / Archived segmented tabs |
| Search | White field, radius 6, 1 pt separator stroke, 30 pt tall, 10 pt side margins | Grey pill (`--m-subtle2`), 44 px tall |
| Section headers | "Today" / date groups, system sidebar header style | none (flat list) |
| Row | ~40 pt: **box chip** `H:dc` (coloured letter + hex, 14 pt semibold), status emoji, title 14 pt **regular** (secondary grey when read), snippet 12 pt secondary + `· 1m`; right: unread count in an accent capsule, needs-you count in an orange `? 1` capsule; hover `gray @ 0.08` radius 6 | ~66 px: 8 px status dot, title 15 px 500, preview 13.5 px, time 12 px right, unread count teal pill; subagent rows indented with `↳` and a spinner; selected row teal tint + 3 px teal left bar |
| Background | Sidebar material, *measured* `#E6E4DE` / `#2A2926`–`#323639` | `--m-panel` white / `#1a1c20` |
| Footer | none; a connection banner appears at the top when offline | Avatar "D", username, "● connected" |
| Missing on web | rail, badges, box chips, Back/Forward, date grouping, hover state | — |
| Missing on Mac | — | Favorites/Archived, theme toggle, mark all read, wordmark, footer, "New session" as a button |

**Density.** Mac fits 15 rows in 860 pt; web fits 11 in 860 px.
**Colour.** The Mac list is *darker* than its chat; the web list is *lighter* than its chat. This is the most noticeable difference in the pair.
**Iconography.** Mac uses SF Symbols with text labels; the web uses unlabeled custom SVG icons.

Phase 2 suggestion: adopt the rail (with labels and badges), the box chips, the 40 pt row, the date section headers and the hover treatment. Keep the web's Favorites/Archived and theme toggle somewhere (a menu on the rail's Conversations entry, or the settings window), and decide whether "New session" stays a button or becomes the toolbar glyph.

## 3. Chat with tool cards and a diff card — `03-chat-diff-*.jpg` (1280×1080), `04-chat-*.jpg` (1280×860)

Same conversation, same diff card (`matron-bridge-merge-and-deploy.md`, +14 −0) on both.

### Header

| | Mac | Web |
|---|---|---|
| Container | 52 pt title-bar accessory; glass capsules 38 pt tall (`.glassEffect` on macOS 26) | 58 px header row on `--m-panel` |
| Left | Capsule: model (`claude-fable-5-1`), `Context: 160k/1m` with a gauge glyph, `CPU 1% · RAM 21%` — all `.caption2` 10 pt text | Title 20 px 600, subtitle `model · workdir · status` 13 px |
| Centre | Capsule: box chip + title `.headline` 13 pt semibold, subtitle (box · email) `.caption2` | — |
| Right | Capsule: three bars **Session / Week / Fable** with % and reset time (`Sat 8am`); media-browser and tracker icon buttons (15 pt) | 2×2 grid of six bars (`cpu ram ctx 5h fbl wk`) 10.5 px mono with %; **Compact** button; `⋯` menu |
| Below | Running-subagent strip (pills, `accent @ 0.12`) only while running | Subagents strip with pills always when children exist |

The web shows cpu/ram as bars; the Mac shows them as text. The Mac shows limit reset times; the web does not. The Mac has no "Compact" button in the header (it is in the context banner).

### Timeline

| | Mac | Web |
|---|---|---|
| Canvas | Warm gradient; rows 8 pt apart; bubble max width 760 | Cream `--m-paper`; max width 860 centred |
| Agent text | **White bubble**, radius 8, shadow `rgb(18,16,14) @ 0.08` 1/1, padding h12 v8, timestamp 10 pt inside bottom-right; body 14.3 pt SF Pro, paragraph gap 8 | **Flat prose** on the canvas, no bubble, 14 px Inter / 22 px, timestamps on hover |
| Operator text | `#C4F5FB` bubble, right-aligned, 32 pt far-edge inset | `--m-self` `#e6f4ef` bubble, radius 14/4 grouping |
| Tool card | White card radius 8, padding 8: chevron, **green check / red octagon**, command in `.callout` mono **bold** 12 pt, args in grey 10 pt on one line; expands to show output on `controlBackgroundColor` | White card radius 10: chevron, `$ command` 12.5 px mono 500, **`exit 0` green badge**, time 12 px; body scrolls at 280 px |
| Diff card | White card: `doc.badge.plus`, filename mono bold 12 pt, `new file` chip (green @ 0.12), `+14` green `−0` red; body is a **`#1F1F1F` terminal block** radius 6 with `#73D173` added lines in 10 pt mono, `@@` hunk in `#8C8C8C`; "+3 more lines" | White card: file icon, filename mono 600, `new file` chip, `+14`/`−0`; body rows **tinted `--m-diff-add`** on white, 12 px mono; "+3 more lines" |
| Milestone / item card | Grey card (`secondary @ 0.08`), radius 10, max width 360, `#4,697` + bold title, body, "Progress · mission" | Full-width white card with `#4697`, title, body, "Progress · mission" |
| System notices | Small emoji-prefixed bubbles ("📬 Sending 1 queued message", "✅ Compacted") | Same events as flat lines |
| Mission renamed | One-line caption with 🏁 | One-line caption with 🏁 |
| Tables | Bordered 0.5 pt, header tint `labelColor @ 0.05`, cell padding 4 | Bordered 1 px `--m-line`, header on `--m-subtle` |
| Links | System blue, underlined | Teal, underlined |
| Jump to bottom | 36 pt `arrow.down.circle.fill` with shadow, bottom-right | 44 px teal circle with an arrow |

**Type.** Mac body 14.3 pt SF at 1.2 leading; web 14 px Inter at 1.57 leading. Mac tool/diff bodies are 10 pt; web 12 px.
**Density.** In the 1080-tall pair the Mac shows the milestone card, the renamed line, the whole diff card, a tool card, a full agent turn and three system notices; the web shows the same minus one system notice.
**Card chrome.** Mac: shadow, no border. Web: no shadow, 1 px `--m-line` border on tool and diff cards.
**Colour.** The green/red status glyphs on Mac tool cards versus the web's `exit 0` badge; the dark terminal block versus tinted rows; teal versus blue links.
**Interaction.** Mac tool cards collapse to one line and show the running state as a spinner; the web keeps the command visible with a scrolling body. The Mac timeline supports cross-message text selection and copy as Markdown; the web relies on browser selection.

Phase 2 suggestion: keep the web's flat agent prose (already agreed in redesign-v5) but adopt the Mac card chrome (radius 8, `rgb(18 16 14 / 0.08)` shadow, no border), the tool-card status glyphs, the `#1F1F1F` terminal block for diff and tool bodies, the 10–12 px mono sizes, and the 360 px prompt/milestone card width. Decide separately whether agent turns get bubbles; the Mac and the redesign-v5 spec disagree.

## 4. Composer — `05-composer-*.jpg`

| | Mac | Web |
|---|---|---|
| Field | White (`matronBubbleBot`), radius **10**, shadow r2 y1, text inset 8; **32 pt** single line, grows to 8 lines (144 pt) | White, radius **12**, 1 px `--m-line` border, **2 px teal border on focus**; ~72 px tall including hint row; grows to 6 rows / 160 px |
| Left control | `plus.circle` 17 pt **outside** the field | Paperclip **inside** the field |
| Right controls | `mic` 15 pt outside; **send `arrow.up.circle.fill` 22 pt appears only when there is text**, in the accent colour | Mic inside; **filled teal square send button** always shown (disabled state when empty) |
| Placeholder | "Message…" | "Send a message…" |
| Hints | none | "/ commands · shift+enter for newline" left, "ctx 16%" right |
| Bar | `.padding()` 16 all round, `Divider` above, bar on the timeline colour | 8 px 16 px 12 px on `--m-panel` |
| Attachments | Tray above the field (56 pt chips, tray 72 pt) | Modal "Send file" dialog |
| Voice | Mic button + global hotkey panel | Mic button, inline recording state |
| Slash commands | Floating palette radius 12, `.regularMaterial`, 220 pt max, selected row `matronAccent @ 0.18` | Palette above the composer, radius 10, `--m-sh-md` |

**Type.** Mac composer text 13 pt; web 14 px.
**Spacing.** The Mac composer block is about 64 pt tall; the web's is about 100 px with the hint row.

Phase 2 suggestion: adopt the 32 px single-line height, radius 10, shadow instead of border, controls outside the field, the send glyph that appears only with content, and drop the hint row (or fold `ctx %` into the header, where the Mac keeps it).

## 5. Tracker: inbox and items — `06-tracker-inbox-*.jpg`, `07-items-pane-*.jpg`, `08-item-detail-*.jpg`

The two clients organise this differently:

- **Mac** has a *Decisions* page on the rail (list column + detail column) **and** a per-chat *Tasks & decisions* pane (⇧⌘I) inside the chat window with a "This chat / All" scope switch and Tasks / Done sections.
- **Web** has one *Tracker* pane that replaces the chat column, with a Missions / Inbox / Memories switch; the inbox has a "Needs you / All"-style filter and no per-chat scope.

| | Mac (Decisions list) | Web (Inbox) |
|---|---|---|
| Header | "Decisions" `.headline` + refresh icon | "Tracker" title 24 px, close ×, segmented Missions / Inbox / Memories at the right |
| Row | glyph column 20 pt; `#4,740` mono digits **with thousands separator** 10 pt; title `.body` **medium 13 pt**, up to 2 lines; snippet `.subheadline` 11 pt; meta line: kind label (Consent), sender, box chip, mission `#193`, **"Needs you" in orange text**, comment count with `bubble.left`; thumbnail 40×40 when the item has an image | glyph; title 15 px; `#4689 · person · time` 13 px; **amber "Needs you" pill**; rows ~72 px |
| Row spacing | v6 h12, separators extended 8 pt | 16 px padding, `--m-line` separators |
| Content width | list 400 pt | ~1130 px centred |

| | Mac (item detail) | Web (item detail) |
|---|---|---|
| Header | glyph, `#4,689 · Question`, **status pill "Closed · Answered"** right, `⋯` menu | back chevron, `#4689 · Question`, amber **Needs you** pill, `⋯` |
| Title | `.title` **22 pt** semibold | ~24 px 600 |
| Origin line | `dan-mac · 🐣 [bd] live app design audit` with a bubble glyph, 11 pt secondary | "Opened from 🐣 [bd] …" as a **teal link** 15 px |
| Body | 16.25 pt with line spacing 4, 640 pt measure, on the **timeline gradient**; the opening post is a white card radius 10 with "Agent · 1 hr ago" | 15 px on the pane background; comments as cards, **own comments in the `--m-self` tint** ("You · 58m ago"), agent comments flat |
| Attachments | Inline thumbnails inside the card | Inline images |
| Reply | Bottom bar: paperclip, "Reply…" field radius 10 with shadow, mic | Bottom: "Reply…" textarea with a filled send button |
| Actions | `ellipsis.circle` menu; answer chips (`matronAccent` fill @ 0.10, stroke @ 0.35) when the item has actions | `⋯` menu; action buttons |

**Colour.** Mac uses orange text for "Needs you" in lists but a red `NeedsYouPill` on the missions dashboard; the web uses one amber pill everywhere. Web comment cards use the self tint for "You"; the Mac uses `matronBubbleMe` for own comments.
**Numbers.** Mac formats item numbers with separators (`#4,689`); the web does not (`#4689`). One of the two should change.

Phase 2 suggestion: adopt the Mac row (13 pt medium title, 11 pt snippet, meta line with box chip and comment count, 40 pt thumbnails), the status pill in the header, the 640 measure and 16 px reading size for the thread, and the reply bar. Keep the web's single Tracker entry point but consider a per-chat scope filter to match the Mac pane.

## 6. Missions — `09-missions-*.jpg`, `10-mission-detail-*.jpg`

| | Mac | Web |
|---|---|---|
| List | **Card dashboard**, full width (rail only, no list column): adaptive grid, min 340 pt, gap 16; header "Missions" `.headline` + "Ask the Coordinator to update" bordered button + refresh | **Row list** in the tracker pane: "OPEN" caps label, flag glyph, title 15 px, `#4706 · person · latest step · time`, amber needs-you pill with count |
| Card | `primary @ 0.04` fill, radius 12 continuous, stroke `primary @ 0.10`, padding 14; `#4,644` + title `.headline`; **red "Needs you · 1" pill**; status paragraph (3 lines, then "Updated 1h ago by an agent"); latest step with a dot; open items with glyphs and chevrons; sessions with box chip, title, 8 pt state dot, summary | — |
| Detail | Full-page: "‹ All missions" link, **Overview / Board** segmented; `#4706` 20 pt mono + title **26 pt bold**; description 15 pt; **STATUS** card (17 pt text, byline); two-column below 900 pt: LATEST STEP card (19 pt semibold), MILESTONES card with "Only your inputs" checkbox and a dotted rail timeline; SESSIONS card with state dots; OPEN TASKS & DECISIONS card; "Close mission…" button. Section labels 12 pt semibold uppercase tracking 0.6 | Single column in the pane: back, `#4706` + title, description, then milestones and items as rows |
| Board view | Kanban: To do / In progress / Done columns (`primary @ 0.04`, radius 12), cards radius 10 | none |

**Type.** Mission page title 26 pt versus the web's ~24 px; the Mac's section labels are small caps-style tracking, the web uses a plain "OPEN" caps label.
**Colour.** Mac mission page uses its own palette (question red, task blue, decision orange, milestone purple/blue) which differs from the rest of the Mac app (question orange, decision purple). The web uses the tracker's amber/teal.

Phase 2 suggestion: this is the largest gap. Adopt the dashboard grid and the mission page layout on the web (with the Mac's card chrome and section labels), and pick one item-kind palette for both clients.

## 7. Memories — `11-memories-*.jpg`, `12-memory-detail-*.jpg`

| | Mac | Web |
|---|---|---|
| List | Rail page: "Memories" `.headline` + refresh + `+`; helper text "Standing rules and facts every agent can read…"; rows: name in **mono 13 pt medium**, type chip ("How to work" / "Project", `secondary @ 0.15` capsule 10 pt), description 13 pt, "Updated 23 hours ago by an agent" 10 pt; selected row `accent @ 0.18` | Tracker pane list: name, description, type chip; no helper text |
| Detail | Grouped form (`.formStyle(.grouped)`): name card (`.title2` semibold), "How to work · Saved 23 hours ago…"; **Type** popup; **Description** field with `175/200` counter; **Notes** with **Edit / Preview** segmented and a mono editor (min 160 pt); full-width **Save**; **Delete memory** | Form: name, type select, description, notes textarea; Save; red Delete |
| Background | Detail on window background, cards white | Pane background |

Phase 2 suggestion: adopt the mono name, the type chip, the helper text, the description counter and the Edit/Preview notes editor.

## 8. Settings — `13-settings-*.jpg`

| | Mac | Web |
|---|---|---|
| Surface | Separate **Settings window** 420×760 (`⌘,`), toolbar tabs General / Devices / Link a Device / Agent Chats | A **popover** under the sidebar's sliders icon |
| Content | Grouped form: **Account** (User ID, Device ID, Server); **Privacy** (Require Touch ID); **Coordinator** (conversation + Change/Clear); **Storage** (journal store, search index, events/conversations, launch timings, last maintenance); **Appearance** (System / Light / Dark segmented); **Voice notes** (hotkey) | username, server URL, **Sign out** button |
| Theme | Appearance picker here | Toggle in the sidebar header (light / dark / system cycle) |
| Devices | Devices tab lists sessions with a "current device" chip (accent @ 0.15) | none |

The web has essentially no settings surface. The theme toggle lives in the sidebar header instead.

Phase 2 suggestion: a settings panel (not a popover) with Account, Appearance and Sign out, styled as the Mac's grouped form; move the theme choice into it.

## 9. Light and dark

| | Mac | Web |
|---|---|---|
| Mechanism | `NSApp.appearance` override (System / Light / Dark) stored in `UserDefaults`; nearly all colours are system semantics that flip automatically | `data-theme` attribute + `prefers-color-scheme`; a full second token set |
| Canvas | `#F2F0EA→#E8E5DC` / `#1D1B18→#171512` (warm in both) | `#efece6` / `#151619` (warm light, cool dark) |
| Sidebar | *measured* `#E6E4DE` / `#2A2926`–`#323639` (warm light, **cool** dark) | `#ffffff` / `#1a1c20` |
| Bubbles / cards | `#FFFFFF` / `#262421` | `#ffffff` / `#1a1c20` |
| Own bubble | `#C4F5FB` / `#123A41` | `#e6f4ef` / `#123530` |
| Accent | system blue in both | `#0d9488` / `#2dd4bf` |
| Code / diff | `#1F1F1F` block in **both** themes | follows the theme |
| Shadows | unchanged in dark (8% warm black) | stronger in dark (30–50% black) |
| Status colours | system (slightly brighter in dark) | same hex in both |

Both clients support both themes, so every pair above exists in light and dark. On the Mac, dark mode's sidebar is cool grey while the timeline stays warm; the web's dark set is deliberately a single cool ladder. Phase 2 should pick one temperature for dark.

## Suggested phase 2 order

1. **Tokens first** (no visible change on its own): write the Mac values from `token-mapping.md` into `design-tokens.css` — surfaces, self bubble, shadows, radii, type sizes, and the accent decision.
2. **Sign-in**: smallest screen, biggest visual gap, and it already has a bug to fix.
3. **Sidebar**: rail, badges, box chips, row density, date groups.
4. **Chat cards and composer**: card chrome, terminal block, tool-card glyphs, composer geometry.
5. **Tracker**: item rows and detail, then the missions dashboard and mission page.
6. **Settings** and memories.

Open decisions for Dan, in the order they block the work: accent (teal everywhere, or the Mac's blue), agent turns (bubble or flat), diff bodies (terminal block or tinted rows), font (system stack or Inter), and one item-kind colour set.
