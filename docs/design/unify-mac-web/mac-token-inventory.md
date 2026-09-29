# Matron Mac app: design token inventory (source-derived)

Read from `matron-apple` at branch `main` (commit `baa196c9`, 29 Sep 2026). All paths below are relative to that repo root and cite `file:line`. "DS" means `MatronShared/Sources/DesignSystem/`. Only shared views the Mac target actually mounts are counted; iOS-only `#if os(iOS)` branches are dropped.

**Key finding:** the Mac asset catalog has **no colour sets**. `MatronMac/Resources/Assets.xcassets` holds only `AppIcon.appiconset` and `app-logo.imageset`, and there is no `AccentColor.colorset`. So `Color.accentColor` / `NSColor.controlAccentColor` resolve to the user's **system accent** (blue by default). The only brand colours are defined in code, in `DS/MatronPalette.swift`.

The mapping of these values onto matron-web's `docs/design/redesign-v5/design-tokens.css` is in [`token-mapping.md`](token-mapping.md).

---

## 1. Colours

### 1a. Custom palette (the only explicit light/dark values)

| Token | Light sRGB | Dark sRGB | Defined | Used for |
|---|---|---|---|---|
| `matronTimelineTop` | 242,240,234 `#F2F0EA` | 29,27,24 `#1D1B18` | DS/MatronPalette.swift:14-15 | Top of the timeline gradient |
| `matronTimelineBottom` | 232,229,220 `#E8E5DC` | 23,21,18 `#171512` | DS/MatronPalette.swift:16-17 | Bottom of the timeline gradient |
| `matronBubbleBot` | 255,255,255 | 38,36,33 `#262421` | DS/MatronPalette.swift:18-19 | Agent bubble, composer field, search field, ask/agent-request cards, item cards |
| `matronBubbleMe` | 196,245,251 `#C4F5FB` | 18,58,65 `#123A41` | DS/MatronPalette.swift:20-21 | Operator (own) bubble, own item comments |
| `matronBubbleShadow` | rgb(18,16,14) @ 0.08 (same in both modes) | — | DS/MatronPalette.swift:23-24 | Shadow on bubbles and cards |
| `matronAccent` | 11,110,125 `#0B6E7D` | 110,205,220 `#6ECDDC` | DS/MatronPalette.swift:31-32 | Ask-user answer chips, ask Send button tint, slash-palette selected row, drop overlay |

- Dark values come from `NSColor(name:)` using `appearance.bestMatch([.aqua,.darkAqua])` (DS/MatronPalette.swift:44-48).
- `MatronTimelineBackground` is a top-to-bottom `LinearGradient` of Top → Bottom (DS/MatronPalette.swift:57-66). It is applied to:
  - the chat column (MacChatView.swift:1213)
  - the sub-chat pane (MacChatView.swift:1863)
  - the item detail view (DS/Items/ItemDetailView.swift:267)
- On the Mac, the Missions dashboard, Decisions, Memories and Items lists do **not** use the gradient; it is iOS-only there.

### 1b. Fixed "terminal" palette (the same in both themes)

| Token | Value | File |
|---|---|---|
| `TerminalStyle.background` | rgb(0.12,0.12,0.12) ≈ `#1F1F1F` | DS/TerminalStyle.swift:10 |
| `TerminalStyle.foreground` | 0.86 ≈ `#DBDBDB` | :12 |
| `diffAdded` | (0.45,0.82,0.45) ≈ `#73D173` | :17 |
| `diffRemoved` | (0.90,0.35,0.35) ≈ `#E65959` | :18 |
| `dimForeground` (`@@` hunk headers) | 0.55 ≈ `#8C8C8C` | :21 |
| Tool-stream notice text | 0.55 grey | DS/LiveOutput/ToolStreamCard.swift:122 |
| ANSI 16-colour palette | See the file | DS/LiveOutput/AnsiSGRParser.swift:15-30 |

### 1c. System semantic colours in use

| Role | Value | Citation |
|---|---|---|
| App/window background (lock overlay) | `Color(nsColor: .windowBackgroundColor)` | App/MacLockOverlay.swift:14 |
| Items pane background | `.background(.background)` (window background). The Coordinator panel that shared this treatment (`MacCoordinatorPanelContainer.swift`) was removed at baa196c9; the Coordinator is now only a page reached from the rail | MacItemsPane.swift:56, :357 |
| Mission page background | `Color(nsColor: .windowBackgroundColor)` | MacMissionPageStyle.swift:103 |
| Sidebar background | No explicit colour. System sidebar material via `.listStyle(.sidebar)` (MacChatListView.swift:1649). The floating sidebar is disabled with `NSSplitViewItemSidebarDefaultsToFloatingAppearance=false` (MatronMacApp.swift:56-58). Mac Decisions and Memories lists use `.plain` + `.scrollContentBackground(.hidden)`, so they show the same material (DS/Items/DecisionsListView.swift:101-104; DS/Memories/MemoriesListView.swift:127-128). The former Missions list (`DS/Missions/MissionsListView.swift`) is deleted; see section 7 | — |
| Bars (sub-chat strip, mini-header, chat search bar, recording/download bars) | `.background(.bar)` | MacChatView.swift:1700, :1975; DS/ChatSearchBar.swift:101; MacItemsPane.swift:936, :948 |
| Code background (tool card, diff card, attachment chip, inline code) | `matronCodeBg` / `matronInlineCodeBg` = `NSColor.controlBackgroundColor`. In the attributed (NSTextView) renderer this now applies to **inline code only**, via `MarkdownPalette.codeBackground` | DS/MarkdownText.swift:230-231; DS/MarkdownAttributed.swift:825-827; DS/MarkdownPlatform.swift:14 |
| Fenced code block (NSTextView renderer) | One box per block: `labelColor` @ 0.05 fill with a 0.5pt `separatorColor` stroke, radius 6, padding 6; wrapped lines hang 16. No longer uses `controlBackgroundColor` | DS/SelectableMessageText.swift:302-322; DS/MarkdownAttributed.swift:96-98 |
| Tool card "Command" inner block | `matronCardInnerBg` = `NSColor.textBackgroundColor` | DS/ToolCallCard.swift:172 |
| Live-output / tool-stream card | `.background.secondary` fill + `.separator` 1pt stroke | DS/LiveOutput/LiveOutputCard.swift:43-46; ToolStreamCard.swift:29-32 |
| Body text | `.primary` / `MarkdownPalette.label` (= `NSColor.labelColor`) | DS/MarkdownPlatform.swift:11, applied at DS/MarkdownAttributed.swift:1070-1074; DS/MarkdownText.swift:170 |
| Block quote text | `NSColor.secondaryLabelColor` (`MarkdownPalette` at DS/MarkdownPlatform.swift:12) | DS/MarkdownAttributed.swift:1068-1074 |
| Secondary text (timestamps, snippets, captions) | `.secondary` | Many places, e.g. DS/MessageBubble.swift:101; MacChatListView.swift:1797 |
| Tertiary text (item/mission metadata, chevrons) | `.tertiary` | DS/Items/ItemRow.swift:63-77; DS/Missions/MissionRowView.swift:35,45,50 |
| Placeholder | `NSColor.placeholderTextColor` | MacComposerView.swift:362 |
| Hairlines/borders | `NSColor.separatorColor` (search field 1pt, table cell borders 0.5pt); `Divider()` between columns, composer, headers | MacSearchView.swift:34; DS/MarkdownAttributed.swift:575 (width `tableBorderWidth` 0.5 at :123); MacChatListView.swift:224; MacChatView.swift:1205 |
| Table header row tint | `labelColor` @ 0.05 | DS/MarkdownAttributed.swift:582 |
| Links | `.accentColor` (MarkdownUI) / `MarkdownPalette.accent` (= `NSColor.controlAccentColor`, DS/MarkdownPlatform.swift:13) + underline; `matron://convo/` links are underlined too | DS/MarkdownText.swift:181; DS/MarkdownAttributed.swift:842-849 |
| Text selection | `NSColor.selectedTextBackgroundColor` | DS/SelectableMessageText.swift:373, 380 |

### 1d. Colour by role (non-semantic usages)

| Role | Colour/opacity | Citation |
|---|---|---|
| Operator bubble | `matronBubbleMe` | DS/MessageBubble.swift:113 |
| Agent bubble | `matronBubbleBot` | DS/MessageBubble.swift:113 |
| Selected nav-rail entry | `accentColor` @ 0.18 fill, accent foreground; unselected is `.secondary` | MacNavColumn.swift:86-88 |
| Selected chat row | System `List(selection:)` highlight (no custom colour) | MacChatListView.swift:1639 |
| Selected memory row | `accentColor` @ 0.18 + `macInboxRow` | DS/Memories/MemoriesListView.swift:142-143 |
| Chat row hover | `Color.gray` @ 0.08 | MacChatListView.swift:1818 |
| Slash palette row | selected `matronAccent` @ 0.18; hover `primary` @ 0.06 | MacSlashCommandPalette.swift:158-162 |
| Send button | `accentColor` when sendable, otherwise `.secondary` | MacComposerView.swift:402 |
| Unread badge | `accentColor` capsule, white text | DS/UnreadBadge.swift:33 |
| Needs-you badge | `Color.orange` capsule, white text | DS/Items/NeedsYouBadge.swift:18 |
| Nav-rail count badge | `Color.red` capsule, white text. The Coordinator rail entry now carries this badge for its unread count | MacNavColumn.swift:104-111 (red at :111); MacChatListView.swift:493-495 |
| Coordinator unread dot | Removed at baa196c9 (`MacCoordinatorToolbarToggle.swift` deleted); replaced by the rail count badge above | — |
| Usage bars | <50% `.green`, <80% `.orange`, otherwise `.red`; track `primary` @ 0.2 | DS/UsageMetersFormat.swift:45-49; DS/UsageMetersView.swift:85 |
| Error banners (chat error, composer error, offline, compact-context) | `Color.red` @ 0.9, white text | MacChatView.swift:805; MacComposerView.swift:566; DS/ConnectionStatusBanner.swift:96; DS/CompactContextBanner.swift:75 |
| Connecting banner | `.ultraThinMaterial` | DS/ConnectionStatusBanner.swift:73 |
| Tool status icons | ok `.green`; error `.red`; outcome badge red @ 0.12 fill | DS/ToolCallCard.swift:122-123, 42-44 |
| Diff card | header counts `+N` `.green` / `−N` `.red`; "new file" chip green @ 0.12; body lines use TerminalStyle | DS/DiffCard.swift:120-121, 159-162, 192-196 |
| Ask/prompt answer chip | `matronAccent` text; fill @ 0.10 (0.22 highlighted); stroke @ 0.35 (0.6 highlighted), 1pt | DS/AskUserSheetBody.swift:238-245 |
| Answered check | `.green` | DS/AskUserCard.swift:60 |
| Tracker item action buttons | chosen answer `.borderedProminent` with a checkmark; the others `.bordered` tinted `accentColor` | DS/Items/ItemActionButtons.swift:36-63 |
| Subtask link card | `accentColor` @ 0.08 fill, @ 0.2 stroke 0.5pt | DS/SubtaskLinkCard.swift:49-53 |
| Conversation-link pills (under text bubbles) | accent text on `accentColor` @ 0.12 capsule; disabled: `.secondary` text on `secondary` @ 0.10 | DS/ConversationLinks.swift:382-394 |
| Running-subagent pills | `accentColor` @ 0.12 (0.25 highlighted) fill, @ 0.25 stroke 0.5pt | MacChatView.swift:1690-1691 |
| Item kind tints | question `.orange`, task `accentColor`, decision `.purple` (overridden on the Mac mission page, see 1e) | DS/Items/ItemGlyph.swift:9 |
| Mission tints | open `accentColor`, closed `.secondary`; milestone userInput `.orange`, progress `.secondary` (overridden on the Mac mission page, see 1e) | DS/Missions/MissionGlyph.swift:21, 32 |
| Inline item card / milestone card | `secondary` @ 0.08 fill; `orange` @ 0.5 stroke when it needs the user | DS/Items/ItemInlineCard.swift:132-133; DS/Missions/MilestoneCard.swift:46-48 |
| Item status pill | (needsUser ? orange : secondary) @ 0.18 | DS/Items/ItemDetailView.swift:322 |
| Labels chip / search tag chip / memory type chip | `secondary` @ 0.15 capsule | DS/Items/ItemDetailView.swift:394; DS/SearchResultRow.swift:61; DS/Memories/MemoriesListView.swift:175-180 |
| Box chip / session tag hues | `[.blue,.green,.orange,.purple,.teal,.pink,.indigo,.brown,.cyan,.mint]`, FNV-hashed by box name; fill alpha 0.18; text mixed toward black 0.35 (light) or white 0.3 (dark) | DS/BoxChip.swift:24-27, 39, 49-50, 63-69 |
| Sender avatar | `BoxChip.tint` solid, black/white text chosen by WCAG | DS/SenderAvatar.swift:33-35 |
| Recording dot | `Color.red` 10×10 | MacComposerView.swift:432; MacItemsPane.swift:910; VoiceNoteRecordingPanel.swift:58 |
| Settings status text | `.red` errors, `.orange` warnings, `.green` success; "current device" chip is accent @ 0.15 | MacAddAgentSheet.swift:47,81,125; MacDevicesView.swift:157-158 |
| Fullscreen viewer | black, black @ 0.85 / 0.4 | DS/AttachmentFullscreenViewer.swift:289, 703, 743, 755 |

### 1e. Mission page and missions dashboard (Mac)

The Mac mission page (`MatronMac/Features/Missions/`) overrides the shared glyph tints through `MacMissionPalette` (MacMissionPageStyle.swift:78-104).

| Role | Colour/opacity | Citation |
|---|---|---|
| Item kind tints (mission page) | question `.red`, task `.blue`, decision `.orange` | MacMissionPageStyle.swift:78-104 |
| Milestone tints (mission page) | userInput `.purple`, progress `.blue` | MacMissionPageStyle.swift:78-104 |
| Board column tints | To do `.gray`, In progress `.blue`, Done `.green` | MacMissionPageStyle.swift:78-104 |
| `MacMissionCard` | fill `controlBackgroundColor`; border `primary` @ 0.10 | MacMissionPageStyle.swift:78-104, 123-141 |
| Needs-you card / row variant | fill `red` @ 0.06, border `red` @ 0.25; needs-you row stroke `primary` @ 0.08, glyph red | MacMissionOverview.swift:99, 103-117 |
| Section label | `.secondary`; `.red` for "Needs you" | MacMissionPageStyle.swift:113-118 |
| Top-bar links ("All missions", "Back to the conversation") | `accentColor` + `chevron.backward` | MacMissionPage.swift:210-235 |
| "Closed" chip | `primary` @ 0.08 capsule | MacMissionPageContent.swift:131-161 |
| Milestone timeline rail | 2pt, `primary` @ 0.12 | MacMissionOverview.swift:376-405 |
| Board column | fill `primary` @ 0.04, stroke @ 0.06 | MacMissionBoardView.swift:36-71 |
| Board card | needs-you fill `red` @ 0.06 / stroke `red` @ 0.25, else stroke `primary` @ 0.10; meta text red when it needs you; cancelled cards at opacity 0.55 | MacMissionBoardView.swift:95-113 |
| Dashboard card chrome (`MissionCardView`) | fill `primary` @ 0.04, stroke `primary` @ 0.10; byline `.tertiary` | DS/Missions/MissionCardView.swift:5-11, 50-93 |
| `NeedsYouPill` (dashboard) | `Color.red` capsule, white text | DS/Missions/NeedsYouPill.swift:12-17 |
| `DashboardStateDot` | running `.green`, waiting `.orange`, done `.gray` | DS/Missions/DashboardSessionRow.swift:10-19 |

---

## 2. Typography

The system font (SF Pro) is used everywhere; there are no custom fonts. Monospaced text uses `.system(_, design: .monospaced)` (SF Mono) or `NSFont.monospacedSystemFont`.

### Chat message body (NSTextView renderer)

This is the Mac-only path: `SelectableMessageText` → `MarkdownAttributed`. The chat sizes are `MarkdownAttributed.Style.chat`; `MessageTextScale` is now macOS-only.

| Element | Size | Citation |
|---|---|---|
| Body | 13 × 1.10 = **14.3pt** regular | DS/MarkdownText.swift:159; DS/MarkdownAttributed.swift:54 (`Style.chat`) |
| Paragraph spacing / line spacing | 8 / 0 | DS/MarkdownAttributed.swift:54 |
| h1 / h2 / h3 | ×1.3 = 18.6pt, ×1.15 = 16.4pt, ×1.05 = 15.0pt, all bold; h4 and below use body size | DS/MarkdownAttributed.swift:1020-1030 |
| Heading space before / after | 10 / 6 | DS/MarkdownAttributed.swift:116-117 |
| Inline code | body × 0.92 ≈ **13.2pt** monospaced on `controlBackgroundColor` | DS/MarkdownAttributed.swift:806-827 |
| Code block | flat **12pt** monospaced, in the boxed block described in 1c | DS/MarkdownAttributed.swift:809-810 |
| List indent / quote indent / code-block indent | 18 / 12 / 8; list paragraph spacing 2; wrapped code lines hang 16 | DS/MarkdownAttributed.swift:83-85, 867, 98 |
| Table cell padding / bottom margin | 4 / 8 | DS/MarkdownAttributed.swift:124-125 |

### Tracker item thread (Mac)

| Element | Size | Citation |
|---|---|---|
| Body | 13 × 1.25 = **16.25pt**; line spacing 4; paragraph spacing 14 | DS/Items/ItemTypography.swift:21-23, 55; DS/MarkdownAttributed.swift:71-73 (`Style.item`) |
| Title | `.title.weight(.semibold)` = **22pt semibold** | DS/Items/ItemTypography.swift:25 |
| Captions | `.callout` (12) and `.subheadline` (11) | DS/Items/ItemTypography.swift:28-29 |

### Font map by surface

Effective macOS sizes are in parentheses (macOS text styles: largeTitle 26, title 22, title2 17, title3 15, headline 13 semibold, body 13, callout 12, subheadline 11, footnote 10, caption 10, caption2 10).

| Surface | Font | Citation |
|---|---|---|
| Sidebar row title | `.system(size: 14)`; box letter `.semibold` | MacChatListView.swift:1785; DS/SessionTagText.swift:29 |
| Sidebar row snippet + relative time | `.system(size: 12)` secondary | MacChatListView.swift:1796, 1804 |
| Sidebar section headers | System `.sidebar` list default | MacChatListView.swift:1641 |
| Nav rail icon / label | `.system(size: 22)` / `.caption2` (10) | MacNavColumn.swift:73, 81 |
| Badges (unread, needs-you, nav count) | `.caption2.weight(.semibold)` (10 semibold) | DS/UnreadBadge.swift:24; DS/Items/NeedsYouBadge.swift:14; MacNavColumn.swift:106 |
| Bubble timestamp | `.caption2` (10) secondary | DS/MessageBubble.swift:100 |
| Date separator | `.caption2` (10) | DS/DateSeparator.swift:98 |
| Activity row label | `.caption` (10) | DS/ActivityIndicatorRow.swift:40 |
| Sender avatar initials | `.system(size: 11, weight: .semibold)` | DS/SenderAvatar.swift:32 |
| Tool card title | `.system(.callout, design: .monospaced).bold()` (12 mono bold); args `.caption` (10); chevron/section headers `.caption2`; code/terminal `.system(.caption, .monospaced)` (10 mono) | DS/ToolCallCard.swift:36-47, 139, 145, 156 |
| Diff card filename | `.system(.callout, .monospaced).bold()` (12); body `.system(.caption, .monospaced)` (10); counts `.caption2.bold()` | DS/DiffCard.swift:143, 150, 73, 159-162 |
| CodeBlock (MarkdownUI path) | `.system(.callout, .monospaced)` (12); language `.caption2` | DS/CodeBlock.swift:21, 33 |
| Live output / tool stream header | `.caption.monospaced()`; terminal pane `.system(size: 12, design: .monospaced)` | DS/LiveOutput/LiveOutputCard.swift:60; DS/LiveOutput/TerminalPane.swift:15 |
| Ask/prompt card | prompt `.body` (13); answered `.callout` (12); hints/errors `.caption` | DS/AskUserCard.swift:56, 62; DS/AskUserSheetBody.swift:47, 123 |
| Agent chat/spawn request card | title `.callout.weight(.semibold)`; headline `.body`; detail label `.caption`, value `.callout` | DS/AgentChatRequestCard.swift:38, 43, 110-111 |
| Subtask card | title `.callout.weight(.medium)`; subtitle `.caption2` | DS/SubtaskLinkCard.swift:26, 30 |
| Conversation-link pill | `.caption.weight(.medium)` | DS/ConversationLinks.swift:382-394 |
| Chat header title | `.headline` (13 semibold); subtitle `.caption2` | MacChatToolbar.swift:335, 341 |
| Header model/context/vitals | `.caption2`; `ContextGaugeLabel` `.caption` | MacChatToolbar.swift:294-320; DS/UsageMetersView.swift:16 |
| Usage bars (compact) | `.system(size: 9)` | DS/UsageMetersView.swift:31 |
| Header icon buttons | `.system(size: 15)` | MacChatToolbar.swift:267, 276 |
| "Your requests" popover title | `.headline` | MacChatHeaderAccessory.swift:223-234 |
| Composer text | `NSFont.preferredFont(.body)` = 13pt; placeholder "Message…" | MacComposerTextEditor.swift:55; MacComposerView.swift:37 |
| Composer icons | plus `.title2` (17); mic `.title3` (15); send `.title` (22) | MacComposerView.swift:257, 381, 401 |
| Slash palette | trigger `.system(.body, .monospaced).bold()`; hint `.system(.caption, .monospaced)`; summary `.caption` | MacSlashCommandPalette.swift:91-133 |
| Sub-chat mini-header | `.subheadline.weight(.semibold)` (11); meta `.caption2` | MacChatView.swift:1936-1944 |
| Running-subagent pill | `.caption` | MacChatView.swift:1686 |
| Tracker item row | glyph `.body`; `#num` `.caption.monospacedDigit()`; title `.body.weight(.medium)` (13 medium); body `.subheadline` (11); meta `.caption2` | DS/Items/ItemRow.swift:42-77 |
| Mission row | title `.body.weight(.medium)`; milestone `.subheadline`; time `.caption2`; attribution `.caption`. On the Mac this row now appears only in the dashboard's collapsed "Closed" section (DS/Missions/MissionsDashboardView.swift:160) | DS/Missions/MissionRowView.swift:18-50 |
| Mission page title | `#num` `.system(size: 20).monospacedDigit()` secondary; title **26pt bold**. (`DS/Missions/MissionDetailView.swift` is no longer mounted on the Mac) | MacMissionPageContent.swift:136-140 |
| Inline item / milestone card | title `.subheadline.weight(.medium)`; pill `.caption2.weight(.semibold)` | DS/Items/ItemInlineCard.swift:122-125; DS/Missions/MilestoneCard.swift:33 |
| Pane headers (Items, Missions dashboard, Decisions, Memories) | `.headline` | MacItemsPane.swift:43; DS/Missions/MissionsDashboardView.swift:79; DS/Items/DecisionsListView.swift:49; DS/Memories/MemoriesListView.swift:43 |
| Banners | `.callout` | DS/ConnectionStatusBanner.swift:66; MacChatView.swift:800 |
| Sign-in | title `.title2.weight(.semibold)` (17); field labels `.caption`; errors/links `.callout`; code field `.system(.body, .monospaced)`; notes `.footnote` | MacSignInView.swift:24, 251, 84, 148, 38 |
| Settings | Mostly `.callout` / `.caption` / `.footnote`; sheet titles `.title2.bold()`; link code `.system(.title2, .monospaced).weight(.semibold)` | MacAddAgentSheet.swift:22; MacDeviceLinkView.swift:32 |
| Drop overlay | icon `.system(size: 42, weight: .light)`; `.title3.weight(.semibold)`; `.callout` | MacChatView.swift:2004-2008 |
| Lock overlay | `.system(size: 40)`; `.title3.weight(.semibold)` | MacLockOverlay.swift:17, 20 |

### Mission page, missions dashboard and memories (Mac)

The mission page uses fixed point sizes rather than text styles.

| Surface | Font | Citation |
|---|---|---|
| Mission page top bar | 14pt; segmented Overview/Board picker | MacMissionPage.swift:210-235 |
| Mission page header | `#num` 20 monospacedDigit; title 26 bold; "Closed" chip 13 semibold; body 15 secondary | MacMissionPageContent.swift:131-161 |
| Status card | byline 13; text 17 with line spacing 3 | MacMissionPageContent.swift:165-187 |
| Section label | 12pt semibold, uppercased, tracking 0.6 | MacMissionPageStyle.swift:113-118 |
| Kind pill | 12pt semibold, white | MacMissionPageStyle.swift:147-153 |
| Overview: latest step | title 19 semibold; meta 14 | MacMissionOverview.swift:63-72 |
| Overview: needs-you row | glyph 14 semibold red; title 16 | MacMissionOverview.swift:103-117 |
| Overview: session row / open items | 16 semibold / 14; open items 16 | MacMissionOverview.swift:178-189, 160-163 |
| Overview: close sheet title | 17 semibold | MacMissionOverview.swift:267-293 |
| Overview: milestone timeline | title 16 semibold; time 13 monospacedDigit; body 15; tag 12 | MacMissionOverview.swift:376-405 |
| Board column header | 13 semibold, tracking 0.5 | MacMissionBoardView.swift:36-71 |
| Board card | title 16 semibold; meta 14 | MacMissionBoardView.swift:95-113 |
| Missions dashboard header | `.headline` | DS/Missions/MissionsDashboardView.swift:17, 77-87 |
| Dashboard mission card | title `.headline`; `#num` `.subheadline.monospacedDigit()`; status `.subheadline`; byline `.caption2` tertiary | DS/Missions/MissionCardView.swift:50-93 |
| `NeedsYouPill` | `.caption.semibold`, white | DS/Missions/NeedsYouPill.swift:12-17 |
| Dashboard session row title | `.subheadline.weight(.medium)` | DS/Missions/DashboardSessionRow.swift:99 |
| Memories list header | `.headline` | DS/Memories/MemoriesListView.swift:43, 54 |
| Memory row | name `.body.weight(.medium).monospaced()`; type chip `.caption.weight(.medium)` | DS/Memories/MemoriesListView.swift:175-180 |
| Memory editor | `.formStyle(.grouped)`; title `.title2.weight(.semibold)`; notes `.body.monospaced()` | DS/Memories/MemoryEditorView.swift:52, 63, 133, 163-164 |

---

## 3. Spacing and layout metrics

### Window and sidebar

| Metric | Value | Citation |
|---|---|---|
| Window minimum | 800×600 | MatronMacApp.swift:89 |
| Window default | 1280×860 | MatronMacApp.swift:252 |
| Toolbar style | `.unified(showsTitle: false)` | MatronMacApp.swift:256 |
| Sidebar column (min / ideal / max) | list 260/400/600 **+ nav rail 72** = **332 / 472 / 672**. On the Coordinator **and** Missions pages it is 72/72/72 (rail only, `showsNavColumnOnly`, :255-257); those full-width pages show Back/Forward and New Chat in the chat header instead (:460-462, 497-503) | MacChatListView.swift:245-257, 438 |
| Nav rail | width 72; buttons 60×56; icon frame height 28; VStack spacing 4; top padding 8 | MacNavColumn.swift:51, 67-84, 99 |
| Nav count badge | offset (8,-6), padding h5 v1, minimum width 16 | MacNavColumn.swift:108-112 |
| Sidebar search field | outer padding h10, top 4, bottom 8; inner padding v7 h8; minimum width 200 | MacChatListView.swift:967-969; MacSearchView.swift:26-27, 36 |
| Chat row | HStack 8; VStack 2; meta HStack 4; padding v4 h4 | MacChatListView.swift:1783-1817 |

Note: the doc comment on `MacChatRow` mentions a "28pt avatar" (MacChatListView.swift:1749), but the current row renders no avatar.

### Chat column and side panes

| Metric | Value | Citation |
|---|---|---|
| Chat column min width | 420 | MacChatView.swift:537 |
| Side pane (sub-chat/items) min and ideal width | 380 | MacChatView.swift:538 |
| Side-by-side breakpoint | 820 | MacChatView.swift:423 |
| Coordinator panel | Removed at baa196c9 (`MacCoordinatorPanelLayout.swift`, `MacCoordinatorPanel.swift`, `MacCoordinatorPanelContainer.swift` deleted). The Coordinator is a full page reached from the rail | — |
| Chat header titlebar accessory | height **52**; cluster capsules height **38** | MacChatHeaderAccessory.swift:314; MacChatToolbar.swift:110 |
| Header internal spacing | clusters h12; button cluster spacing 14, h10.5; subagent capsule h6.5; group spacing 10; bar h8 | MacChatToolbar.swift:256-281; MacChatHeaderAccessory.swift:133-162 |
| "Your requests" popover | 340×420; title padding h12 v10 | MacChatHeaderAccessory.swift:213-243 |
| Timeline | row VStack spacing **8**; `.padding(.vertical)` (system default) | MacChatView.swift:1436, 1485 |
| Bubble max width | `MessageBubbleMetrics.maxWidth` = **760**, also used for tool, diff, live-output and subtask cards | DS/MessageBubble.swift:31 |
| Bubbles | outer `.padding(.horizontal)` (system default); own-bubble far-edge inset 32 | DS/MessageBubble.swift:73-83 |
| Bubble inner padding | h12 v8; content↔time spacing 6; avatar↔bubble spacing 6 | DS/MessageBubble.swift:69, 96, 107-108 |
| Conversation-link pill row (beneath text bubbles) | bubble↔row VStack spacing 4; pill padding h10 v5, max width 240; flow spacing 6; at most 4 visible then "+N"; leading inset 32 for own messages, `SenderAvatar.diameter + 6` = 30 for agent messages when the avatar shows, else 0 | MacTimelineItemView.swift:130-132; DS/ConversationLinks.swift:98, 359-362, 366, 382-394, 409-415 |
| Ask / agent-request / spawn / item-inline / milestone card max width | 360 | MacTimelineItemView.swift:299, 316, 336, 366, 374 |
| Tool / diff cards | padding 8; VStack 8; header HStack 8; inner code padding 8 | DS/ToolCallCard.swift:32-34, 113, 146; DS/DiffCard.swift:60, 91, 75 |
| Ask card / request cards | `.padding()` (system default); VStack 16 (ask) / 10 (request); answer chip v8 h12 | DS/AskUserCard.swift:65; DS/AskUserSheetBody.swift:46, 236-237; DS/AgentChatRequestCard.swift:36, 85 |
| Tracker item action buttons | HStack / VStack spacing 8 | DS/Items/ItemActionButtons.swift:36-63 |
| Subtask card | padding h12 v10; spacing 10 | DS/SubtaskLinkCard.swift:20, 45-46 |
| Inline item / milestone cards | padding 10; spacing 10/3/6 | DS/Items/ItemInlineCard.swift:117-131 |
| Date separator pill | h10 v4; row v4 | DS/DateSeparator.swift:100-105 |
| Activity row | dots 6×6 with spacing 4; bottom padding 8 above the composer | DS/ActivityIndicatorRow.swift:55-58; MacChatView.swift:903 |
| Top banners | clipped radius 8, `.padding(.horizontal)`, top 8; inner h12 v8 | MacChat/ChatTopBanner.swift:35-48 |
| Sub-agent strip | HStack 8; pill h10 v6; strip h12 v6 | MacChatView.swift:1679-1700 |
| Sub-chat mini-header | spacing 10; h12 v8 | MacChatView.swift:1926, 1973-1974 |
| Floating controls | jump/stop 36pt glyphs; trailing 16, top/bottom 8; stack spacing 8 | DS/ChatTopTrailingControls.swift:39-48; DS/JumpToBottomButton.swift:19-27 |

### Composer

| Metric | Value | Citation |
|---|---|---|
| Row | HStack(.bottom, spacing 4); `.padding()` all round | MacComposerView.swift:247, 423 |
| Text inset | 8 | MacComposerTextEditor.swift:49, 80 |
| Accessory container width | 28 | MacComposerView.swift:73 |
| Single-line input height | body line height + 16 ≈ **32pt** | MacComposerView.swift:51-64 |
| Maximum height | 8 lines + 16 ≈ **144pt**, then it scrolls | MacComposerView.swift:51-64 |
| Plus / mic side insets | leading 4 / trailing 4 | MacComposerView.swift:271 (leading), :390, :412 (trailing) |
| Slash palette | max height 220; floats 4pt above the composer | MacSlashCommandPalette.swift:33; MacComposerView.swift:113-125 |
| Attachment tray | chip side 56; tray height 72; padding h12 v8; file chip maximum width 160 | DS/AttachmentTray.swift:27-37, 51, 92 |

### Tracker, lists and sheets

| Metric | Value | Citation |
|---|---|---|
| Items pane chrome header | h12 v8 | MacItemsPane.swift:52 |
| Item thread | column measure **640** centred; thread spacing 18; card padding 14 | DS/Items/ItemTypography.swift:67, 70, 72; DS/Items/ItemDetailView.swift:185-205 |
| Item comment composer | field padding 8; maximum width 640 | DS/Items/ItemCommentComposer.swift:29, 108 |
| List headers (Items / Missions dashboard / Decisions / Memories) | `.padding(.horizontal).padding(.vertical, 8)` | DS/Items/ItemsListView.swift:83; DS/Missions/MissionsDashboardView.swift:86; DS/Items/DecisionsListView.swift:59; DS/Memories/MemoriesListView.swift:54 |
| Mac inbox rows | `listRowInsets(EdgeInsets())`, h12; separators extended 8pt past the row edges; rows add v6 | DS/MacInboxRow.swift:27-32; DS/Items/DecisionsListView.swift:86; DS/Missions/MissionRowView.swift:57 |
| Item / mission row | HStack(.top, spacing 10); glyph column 20 wide, top 2; VStack 2 (item) / 4 (mission); thumbnail 40×40 | DS/Items/ItemRow.swift:39-45, 92 |
| Memory row type chip | padding h6 v1 | DS/Memories/MemoriesListView.swift:175-180 |
| Memory editor notes field | minimum height 160 | DS/Memories/MemoryEditorView.swift:163-164 |
| Sign-in | 480×640, padding 32; VStack 16/12; logo 72×72; QR 200×200 | MacSignInView.swift:16-20, 164-165, 211 |
| Settings sheets | General 420×760 (`.formStyle(.grouped)`); Devices 480×400; Link 420×420 (padding 24); Agent Chats 480×400; Add Agent 440 wide (padding 20) | MacDeviceSettingsView.swift:106-109; MacDevicesView.swift:68; MacDeviceLinkView.swift:67-68; MacAgentChatView.swift:64; MacAddAgentSheet.swift:32-33 |
| New Chat sheet | width = clamp(win×0.7, 480, 880); list max height = clamp(win×0.6, 300, 650); padding 20 | MacNewChatSheet.swift:54-57, 104 |
| Media browser sheet | 640×520 | MacMediaBrowserSheet.swift:64 |
| Coordinator chooser | 480×460 | MacCoordinatorChooserSheet.swift:67 |
| Voice panel | h14 v10 | VoiceNoteRecordingPanel.swift:70-71 |

### Mission page and missions dashboard (Mac)

Colours are in 1e, fonts in section 2, radii in section 4 and strokes in section 5.

| Metric | Value | Citation |
|---|---|---|
| Mission page layout | max content width 1300; two-column breakpoint 900; horizontal padding 32; side column fraction 0.4; column spacing 24 | MacMissionPageStyle.swift:24-31 |
| Mission page stack | VStack spacing 20; vertical padding 24 | MacMissionPageContent.swift:111, 124 |
| Top bar | HStack 16; padding h16 v8 | MacMissionPage.swift:210-235 |
| "Closed" chip | padding h10 v3 | MacMissionPageContent.swift:131-161 |
| `MacMissionCard` | padding 20 | MacMissionPageStyle.swift:123-141 |
| Kind pill | padding h9 v3 | MacMissionPageStyle.swift:147-153 |
| Overview: latest step dot | 11 | MacMissionOverview.swift:63-72 |
| Overview: needs-you row | padding h12 v10 | MacMissionOverview.swift:103-117 |
| Overview: close sheet | 440 wide; padding 20 | MacMissionOverview.swift:267-293 |
| Overview: milestone timeline | dot 12; 2pt rail; row gap 18 | MacMissionOverview.swift:376-405 |
| Board columns | HStack 16; column padding 14, minimum height 320; header dot 9 | MacMissionBoardView.swift:25, 36-71 |
| Board card | padding 14 | MacMissionBoardView.swift:95-113 |
| Dashboard header | HStack 12; `.padding(.horizontal).padding(.vertical, 8)` | DS/Missions/MissionsDashboardView.swift:77-87 |
| Dashboard page | spacing 20; padding 16; no gradient on the Mac | DS/Missions/MissionsDashboardView.swift:123-129 |
| Dashboard grid | adaptive, minimum 340, spacing 16 | DS/Missions/MissionsDashboardView.swift:49, 139 |
| Dashboard mission card | padding 14; spacing 10 | DS/Missions/MissionCardView.swift:27-36 |
| `NeedsYouPill` | padding h8 v3 | DS/Missions/NeedsYouPill.swift:12-17 |
| `DashboardStateDot` | 8pt | DS/Missions/DashboardSessionRow.swift:10-19 |
| Loose session card | padding 12 | DS/Missions/LooseSessionCardView.swift:16 |

---

## 4. Corner radii

| Radius | Applied to | Citation |
|---|---|---|
| 5 | Code-block copy button (thinMaterial) | DS/SelectableMessageText.swift:103 |
| 6 | Chat row hover/clip, sidebar search field, tool/diff inner code blocks, CodeBlock, item thumbnail, fenced code block box (NSTextView renderer) | MacChatListView.swift:1819; MacSearchView.swift:29, 33; DS/ToolCallCard.swift:149, 161; DS/DiffCard.swift:78; DS/CodeBlock.swift:37; DS/Items/ItemRow.swift:92; DS/SelectableMessageText.swift:302-322 |
| 8 | **Message bubbles**; tool card; diff card; live-output/tool-stream cards; answer chips; nav-rail selection; attachment image/file/tray chips; spawn command block; top banners (continuous); mission-overview needs-you row | DS/MessageBubble.swift:114; DS/ToolCallCard.swift:115; DS/DiffCard.swift:93; DS/LiveOutput/LiveOutputCard.swift:43; DS/AskUserSheetBody.swift:240; MacNavColumn.swift:87; DS/AttachmentImage.swift:56; DS/AttachmentFile.swift:78; DS/AttachmentTray.swift:57; DS/AgentSpawnRequestCard.swift:70; ChatTopBanner.swift:35; MacMissionOverview.swift:103-117 |
| 10 | **Composer input**; item comment field; item-thread cards; inline item card; milestone card; mission board cards | MacComposerView.swift:355; DS/Items/ItemCommentComposer.swift:126; DS/Items/ItemDetailView.swift:691; DS/Items/ItemInlineCard.swift:132; DS/Missions/MilestoneCard.swift:46; MacMissionBoardView.swift:95-113 |
| 12 | Ask/prompt card, agent chat/spawn cards, item spawn card, subtask card, slash palette, voice-note panel (continuous); `MacMissionCard` (continuous), mission board columns, dashboard mission cards (continuous) | DS/AskUserCard.swift:85; DS/AgentChatRequestCard.swift:87; DS/SubtaskLinkCard.swift:48; MacSlashCommandPalette.swift:73; VoiceNoteRecordingPanel.swift:72; MacMissionPageStyle.swift:123-141; MacMissionBoardView.swift:36-71; DS/Missions/MissionCardView.swift:5-11 |
| 16 | Drop-overlay dashed frame; iOS comment field (not on Mac) | MacChatView.swift:1996 |
| Capsule | Badges, date separator, paginating pill, subagent pills, box chip, status/label chips, header clusters (glass), tool/diff outcome badges, conversation-link pills, mission kind pill, "Closed" chip, `NeedsYouPill`, memory type chip | DS/UnreadBadge.swift:33; DS/DateSeparator.swift:102; MacChatHeaderAccessory.swift:59-68; DS/ConversationLinks.swift:382-394; MacMissionPageStyle.swift:147-153; MacMissionPageContent.swift:131-161; DS/Missions/NeedsYouPill.swift:12-17; DS/Memories/MemoriesListView.swift:175-180 |
| Circle | Sender avatar (24), jump-to-own-message button (36), recording dot (10), dashboard state dot (8), board column header dot (9), mission latest-step dot (11), milestone timeline dot (12) | DS/SenderAvatar.swift:24, 35; DS/JumpToLastOwnMessageButton.swift:20-21; DS/Missions/DashboardSessionRow.swift:10-19; MacMissionBoardView.swift:36-71; MacMissionOverview.swift:63-72, 376-405 |

---

## 5. Shadows, materials and strokes

### Shadows

| Shadow | Applied to | Citation |
|---|---|---|
| `matronBubbleShadow` (8% warm black), radius 1, y 1 | Bubbles | DS/MessageBubble.swift:115 |
| Same colour, radius 2, y 1 | Composer, ask card, agent-request/spawn cards, item cards, item comment field | MacComposerView.swift:356; DS/AskUserCard.swift:87; DS/Items/ItemDetailView.swift:692 (also :468) |
| black @ 0.18, radius 10, y 3 | Slash palette | MacSlashCommandPalette.swift:76 |
| black @ 0.15, radius 4, y 2 | Jump-to-bottom, stop, jump-to-own buttons | DS/JumpToBottomButton.swift:21; DS/StopTurnButton.swift:24; DS/JumpToLastOwnMessageButton.swift:22 |

The Coordinator panel's overlay-mode shadow (black @ 0.18, radius 12, x −2) was removed at baa196c9 with the panel.

### Materials

| Material | Applied to | Citation |
|---|---|---|
| `.regularMaterial` | Slash palette, paginating pill, voice panel, jump button, header capsules (fallback) | MacSlashCommandPalette.swift:72; DS/PaginatingHeader.swift:30; MacChatHeaderAccessory.swift:64, 67 |
| `.glassEffect(.regular, in: .capsule)` | Header capsules on the macOS 26 SDK | MacChatHeaderAccessory.swift:62 |
| `.ultraThinMaterial` | Date separator, connecting banner, drop overlay | DS/DateSeparator.swift:102; DS/ConnectionStatusBanner.swift:73; MacChatView.swift:1995 |
| `.thinMaterial` | Code copy button | DS/SelectableMessageText.swift:103 |
| `.bar` | Strips, headers and bars listed in section 1c | — |

### Strokes

| Stroke | Applied to | Citation |
|---|---|---|
| `separatorColor` 1pt | Search field | MacSearchView.swift:34 |
| `separatorColor` 0.5pt | Fenced code block box (NSTextView renderer) | DS/SelectableMessageText.swift:302-322 |
| `.separator` 1pt | Live-output / tool-stream cards | DS/LiveOutput/LiveOutputCard.swift:46 |
| `matronAccent` 1pt (@ 0.35 / 0.6) | Answer chips | DS/AskUserSheetBody.swift:245 |
| accent @ 0.2 / 0.25, 0.5pt | Subtask card and pills | DS/SubtaskLinkCard.swift:53; MacChatView.swift:1691 |
| orange @ 0.5 (default 1pt) | Needs-you inline item / milestone cards | DS/Items/ItemInlineCard.swift:133 |
| `matronAccent` 2pt, dash [8,6] | Drop overlay | MacChatView.swift:1997-1999 |
| 0.5pt | Table cell borders | DS/MarkdownAttributed.swift:123 |
| `primary` @ 0.10 | `MacMissionCard`, board cards (default), dashboard mission cards | MacMissionPageStyle.swift:123-141; MacMissionBoardView.swift:95-113; DS/Missions/MissionCardView.swift:5-11 |
| `red` @ 0.25 | Needs-you `MacMissionCard` and board cards | MacMissionOverview.swift:99; MacMissionBoardView.swift:95-113 |
| `primary` @ 0.08 | Mission-overview needs-you row | MacMissionOverview.swift:103-117 |
| `primary` @ 0.06 | Mission board columns | MacMissionBoardView.swift:36-71 |
| `primary` @ 0.12, 2pt | Milestone timeline rail | MacMissionOverview.swift:376-405 |

The 1pt `separatorColor` panel edge (`MacCoordinatorPanelContainer.swift`) was removed at baa196c9 with the Coordinator panel.

### Opacity dims

- The header dims when the window is inactive: title 0.7, meters 0.8, buttons 0.5 (MacChatToolbar.swift:204, 212, 222, 277, 287, 338).
- A message that is still sending renders at 0.7 (MacTimelineItemView.swift:86).
- Cancelled cards on the mission board render at 0.55 (MacMissionBoardView.swift:95-113).

---

## 6. Iconography (SF Symbols)

| Chrome | Symbol | Size | Citation |
|---|---|---|---|
| Sidebar toggle | Removed (`.toolbar(removing: .sidebarToggle)`); ⌘⇧S only | — | MacChatListView.swift:433 |
| New chat | `square.and.pencil` | Toolbar default | MacChatListView.swift:481; MacChatHeaderAccessory.swift:181 |
| Back / Forward | `chevron.backward` / `chevron.forward` | Toolbar default | MacNavigationHistory.swift:189-193 |
| Coordinator nav | `person.crop.circle.badge.checkmark` (the toolbar toggle that shared it was removed at baa196c9; the symbol is also used in the chooser sheet) | Rail 22pt | MacNavColumn.swift:26; MacCoordinatorChooserSheet.swift:87 |
| Missions nav | `flag.checkered` (closed: `flag.checkered.circle.fill`) | 22pt rail | MacNavColumn.swift:27; DS/Missions/MissionGlyph.swift:15 |
| Decisions nav | `checkmark.circle` | 22pt | MacNavColumn.swift:28 |
| Conversations nav | `bubble.left.and.bubble.right` | 22pt | MacNavColumn.swift:29 |
| Memories nav | `brain` (⌘5) | 22pt | MacNavColumn.swift:30 |
| Tracker (tasks & decisions) pane toggle | `checklist` + NeedsYouBadge scaled 0.8 | 15pt | MacChatToolbar.swift:221 (scale at :225) |
| Media browser | `photo.on.rectangle.angled` | 15pt | MacChatToolbar.swift:211 |
| Subagents menu | `arrow.triangle.branch` (items `circle.dashed` / `checkmark.circle`) | 15pt | MacChatToolbar.swift:245, 241 |
| Compact | `arrow.down.right.and.arrow.up.left` | `.caption2` | MacChatToolbar.swift:302 |
| Settings tabs | `gearshape`, `laptopcomputer.and.iphone`, `qrcode`, `person.2.wave.2` | Tab default | MatronMacApp.swift:278-291 |
| Send | `arrow.up.circle.fill` | `.title` (22) | MacComposerView.swift:400 |
| Mic | `mic` | `.title3` (15) | MacComposerView.swift:380 |
| Attach | `plus.circle` (item comment field uses `paperclip`) | `.title2` (17) | MacComposerView.swift:256; DS/Items/ItemCommentComposer.swift:67 |
| Archive | **None.** The context menu offers only Mute and Leave | — | MacChatListView.swift:1659-1672 |
| Tool card | `chevron.right` / `chevron.down` (caption2); status `checkmark.circle.fill` / `xmark.octagon.fill` (caption); running = ProgressView 0.7 scale in a 12×12 frame; expired `clock.badge.exclamationmark` | — | DS/ToolCallCard.swift:35, 102, 121-123 |
| Diff card | chevrons + `doc.text` / `doc.badge.plus` (caption) | — | DS/DiffCard.swift:102-104 |
| Item kinds | question `questionmark.circle.fill`, task `checklist`, decision `scalemass.fill`; consent `hand.raised`; comments `bubble.left`; tapped-answer comments `hand.tap`; photo placeholder `photo` | `.body` glyph, 20 wide | DS/Items/ItemGlyph.swift:6; DS/Items/ItemRow.swift:59-94; DS/Items/ItemDetailView.swift:409 |
| Item action buttons | chosen answer carries a checkmark | — | DS/Items/ItemActionButtons.swift:36-63 |
| Milestones | `person.fill` (user input), `circle.fill` (progress) | caption2 | DS/Missions/MissionGlyph.swift:26 |
| Conversation-link pills | `bubble.left.and.bubble.right` | `.caption` | DS/ConversationLinks.swift:98 |
| Missions dashboard | refresh `arrow.clockwise`; ask the Coordinator `arrow.triangle.2.circlepath` | — | DS/Missions/MissionsDashboardView.swift:77-87 |
| Mission page | "All missions" / "Back to the conversation" `chevron.backward`; segmented Overview/Board picker | 14pt | MacMissionPage.swift:210-235 |
| Memories | Rail entry `brain` (⌘5); views in `MatronMac/Features/Memories/MacMemoriesColumn.swift` (`MacMemoriesColumn`, `MacMemoryDetail`) on `DS/Memories/MemoriesListView.swift` and `DS/Memories/MemoryEditorView.swift` | 22pt rail | MacNavColumn.swift:30 |
| Status dots | Not symbols: red `Circle` 10pt (recording); activity dots 6pt `.secondary`; mission dashboard state dots 8pt (section 1e). The 7pt coordinator unread dot was removed at baa196c9 | — | DS/ActivityIndicatorRow.swift:58; DS/Missions/DashboardSessionRow.swift:10-19 |
| Send states | `clock`, `clock.arrow.circlepath`, `exclamationmark.circle` | caption2 | DS/SendStateIndicator.swift:42-72 |
| Floating controls | `arrow.down.circle.fill` 36, `stop.circle.fill` 36, `arrow.up.to.line` 17 semibold in a 36 circle | — | DS/JumpToBottomButton.swift:18; DS/StopTurnButton.swift:21; DS/JumpToLastOwnMessageButton.swift:18 |
| Misc | pane close `xmark`, back `chevron.left`, item actions `ellipsis.circle`, refresh `arrow.clockwise`, new item `plus`, drop overlay `square.and.arrow.down.on.square` 42 light, search `magnifyingglass`, sub-chat switcher `rectangle.stack`, agent chat `person.2.wave.2.fill`, spawn `sparkles.rectangle.stack`, subtask `arrow.triangle.branch`, offline `wifi.slash` | — | Various |

---

## 7. Structure (files to read next)

**App shell:** `MatronMac/App/MatronMacApp.swift`
- The `WindowGroup` shows one of: the bootstrap spinner (480×360), `MacSignInView`, or `MacChatListView`.
- The `Settings` scene is a `TabView` with four tabs.
- There is a lock overlay: `App/MacLockOverlay.swift`.
- Menu commands live in `App/Commands.swift`.

**Sign-in:** `Features/Onboarding/MacSignInView.swift`
- A logo, the title, then a password/server form or link-code entry, plus a rendezvous QR code.
- Uses `DS/QRCodeView.swift`.

**Shell / sidebar:** `Features/ChatList/MacChatListView.swift`
- `NavigationSplitView` (see `splitView` at :425). The sidebar is `MacNavColumn` (72pt icon rail) + `Divider` + the list for the selected entry. On the Coordinator and Missions pages the rail is shown alone (:232-236).
- There is **no Conversations/Tracker segmented toggle**. The rail has five entries: Coordinator, Missions, Decisions, Conversations, Memories (`Features/Nav/MacNavColumn.swift:7-12`; ⌘1–⌘5, Memories is ⌘5).
- **Conversations:** `ConnectionStatusBanner` → `MacSearchView` → `MacChatSidebarList` (`.sidebar` list, grouped `Section`s of `MacChatRow`, :1612-1827; `MacChatRow` at :1750).
- **Missions:** there is no Missions list in the sidebar (`Features/Missions/MacMissionsColumn.swift` and `DS/Missions/MissionsListView.swift` are deleted). The detail is either the dashboard or a mission page:
  - No mission selected: `MacMissionsDashboard` (`Features/Missions/MacMissionsDashboard.swift` → `DS/Missions/MissionsDashboardView.swift`, with `MissionCardView`, `LooseSessionCardView`, `DashboardSessionRow`, `NeedsYouPill`, `MissionsDashboardFormat`). Closed missions sit in a collapsed "Closed" section rendered with `MissionRowView`.
  - Mission selected: `MacMissionPage` (`Features/Missions/MacMissionPage.swift` → `MacMissionPageContent.swift`, then `MacMissionOverview.swift` (Overview) or `MacMissionBoardView.swift` (Board), styled by `MacMissionPageStyle.swift`). `DS/Missions/MissionDetailView.swift` is no longer mounted on the Mac.
- **Decisions:** `DS/Items/DecisionsListView.swift` (rows are `DS/Items/ItemRow.swift`). Detail: `MacItemDetailHost` in `MacItemsPane.swift`.
- **Memories:** `Features/Memories/MacMemoriesColumn.swift` (`MacMemoriesColumn`, `MacMemoryDetail`), mounted at MacChatListView.swift:230-231 and :1211-1233. List: `DS/Memories/MemoriesListView.swift`; editor: `DS/Memories/MemoryEditorView.swift` (grouped `Form`).
- Search results: `Features/Search/MacSearchResultsView.swift` + `DS/SearchResultRow.swift`.
- New chat: `Features/ChatList/MacNewChatSheet.swift`.
- **Coordinator:** reachable only as a page (rail / ⌘1). The resizable Coordinator panel (`MacCoordinatorPanelContainer.swift`, `MacCoordinatorPanel.swift`, `MacCoordinatorPanelLayout.swift`, `MacCoordinatorToolbarToggle.swift`) and the ⌘0 "Show Coordinator Panel" command were removed at baa196c9. `MacCoordinatorToolbarPlaceholder` moved to `Features/Nav/MacNavigationHistory.swift:206`; the "Your requests" popover moved to `Features/Chat/MacChatHeaderAccessory.swift:213-243` (340×420, title `.headline` h12 v10 at :223-234). The chooser sheet remains: `Features/Coordinator/MacCoordinatorChooserSheet.swift`.
- Back/Forward: `Features/Nav/MacNavigationHistory.swift`.

**Chat thread:** `Features/Chat/MacChatView.swift`
- `chatColumn` (:793): error banner → `ChatSearchBar` → `CompactContextBanner` → `MacRunningSubagentStrip` → `ScrollView` of `MacTimelineListContent` → `Divider` → `MacComposerView`, all on `MatronTimelineBackground`.
- It uses an `HSplitView` with `MacSubChatPane` or `MacItemsPane` at ≥820pt.
- Rows: `Features/Chat/MacTimelineItemView.swift`, which dispatches to:
  - `DS/MessageBubble.swift` + `DS/SelectableMessageText.swift` / `DS/MarkdownAttributed.swift` (text bubbles now carry a `ConversationLinkPillRow` beneath them, VStack spacing 4, MacTimelineItemView.swift:95-138, :130-132; pills in `DS/ConversationLinks.swift`)
  - `DS/ToolCallCard.swift`, `DS/DiffCard.swift`
  - `DS/LiveOutput/LiveOutputCard.swift`, `ToolStreamCard.swift`
  - `DS/AskUserCard.swift` + `DS/AskUserSheetBody.swift` (prompt/question)
  - `DS/AgentChatRequestCard.swift`, `DS/AgentSpawnRequestCard.swift`
  - `DS/Items/ItemInlineCard.swift`, `DS/Missions/MilestoneCard.swift` (includes `MissionNotice`)
  - `DS/CoordinatorNotice.swift`, `DS/SubtaskLinkCard.swift`
  - `DS/DateSeparator.swift`, `DS/ActivityIndicatorRow.swift`
  - `DS/AttachmentImage.swift`, `DS/AttachmentFile.swift`
- **Header, usage and context meters:** the header is an `NSTitlebarAccessoryViewController`, not the toolbar (`Features/Chat/MacChatHeaderAccessory.swift`). Its clusters are built in `Features/Chat/MacChatToolbar.swift`: model/context/vitals on the left, title/subtitle in the centre, then usage bars, media/tasks buttons and subagents on the right. Meters render through `DS/UsageMetersView.swift` (`ContextGaugeLabel`, `UsageBarsView`) with helpers in `DS/UsageMetersFormat.swift`.
- Other chat files: `ChatTopBanner.swift`, `MacFindInChat.swift`, `MacMediaBrowserSheet.swift` (→ `DS/MediaBrowserView.swift`).

**Composer:**
- `Features/Chat/MacComposerView.swift` + `MacComposerTextEditor.swift` (NSTextView).
- `MacSlashCommandPalette.swift`; `DS/AttachmentTray.swift`; `DS/UploadProgressBar.swift`.
- Voice: `Features/VoiceHotkey/VoiceNoteRecordingPanel.swift`.

**Tracker pane (per chat, ⇧⌘I):** `Features/Items/MacItemsPane.swift`
- `MacItemsPaneChrome` header → `DS/Items/ItemsListView.swift`, with a segmented "This chat / All" scope picker and `.inset` list.
- Pushes `MacItemDetailHost` → `DS/Items/ItemDetailView.swift`, `ItemCommentComposer.swift`, `ItemResolveControl.swift`, `ItemActionButtons.swift`, `ItemTypography.swift`.
- `NewItemSheet` (420 wide).

**Settings:** all in `Features/Settings/`: `MacDeviceSettingsView.swift` (grouped `Form` including `AppearancePicker`), `MacDevicesView.swift`, `MacDeviceLinkView.swift`, `MacAgentChatView.swift`, `MacAddAgentSheet.swift`. The Coordinator setting row is in `Features/Coordinator/MacCoordinatorSettingRow.swift`.

---

## 8. Light and dark handling

- **Mostly system semantic colours.** Nearly all chrome uses `.primary/.secondary/.tertiary/.quaternary`, the `NSColor` semantics, materials, `.bar`, `.background` and system hues. These adapt automatically.
- **Explicit dark values exist only for the six `MatronPalette` colours** (section 1a), resolved per `NSAppearance`.
- **`TerminalStyle` and the ANSI palette are deliberately dark in both themes.** Diff green/red are hard-coded because system `.green`/`.red` resolve to their light-mode variants on a dark surface (DS/TerminalStyle.swift:13-18).
- **App-level override:** `MatronAppearance` (System / Light / Dark) is stored in `UserDefaults` under the key `"MatronAppearance"`.
  - It is applied through `NSApp.appearance` (MatronMacApp.swift:211-213; DS/MatronAppearance.swift:43-49).
  - It is picked with a segmented `AppearancePicker` in General settings (MacDeviceSettingsView.swift:79-83).
- **`@Environment(\.colorScheme)` is read only for box-hue text tinting.** `BoxChip.textTint` mixes toward black 0.35 in light mode and toward white 0.3 in dark mode (macOS 15+). Readers:
  - DS/BoxChip.swift:63-69
  - MacChatListView.swift:1754
  - MacChatView.swift:380
  - MacSearchResultsView.swift:17
  - MacMissionOverview.swift:175 and :317
  - DS/Missions/DashboardSessionRow.swift:37
  - DS/SearchResultRow.swift:25
  - (DS/Missions/MissionDetailView.swift:78 still reads it but is no longer mounted on the Mac)
- **No asset-catalog colour sets and no custom AccentColor**, so the app accent is the user's system accent. The brand teal `matronAccent` is used only on the ask/answer chips, the palette selection and the drop overlay (MacChatView.swift:1998 and :2011). `DS/MatronPalette.swift:26-30` notes it replaced `accentColor` on those surfaces because the system blue read as foreign against the cream palette.
