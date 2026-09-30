---
name: Owl Fund
description: The fund's book at a desk, Perplexity-style. A warm-grey night page, hairlines not boxes, one big number and the sentence that explains it, and a place to ask.
colors:
  ink: "#e8e8e6"
  page: "#191a1a"
  surface: "#202222"
  sidebar: "#1f2121"
  secondary-fill: "#2a2c2c"
  row-divider: "#242626"
  section-divider: "#2d2f2f"
  control-outline: "#3a3d3d"
  meta-grey: "#8d9191"
  ink-2: "#b5b8b8"
  ink-3: "#c9cccc"
  series-grey: "#6b6f6f"
  bench-grey: "#4a4d4d"
  up: "#3dd68c"
  down: "#ff6369"
  down-fill: "#2d1818"
  caution: "#f0a64a"
  caution-fill: "#231e17"
  caution-line: "#3b2e1c"
  economy: "#9cc3ff"
  day-ink: "#0a0a0a"
  day-paper: "#ffffff"
  day-surface: "#fafafa"
  day-sidebar: "#fafafa"
  day-secondary-fill: "#f4f4f5"
  day-row-divider: "#f4f4f5"
  day-section-divider: "#ededed"
  day-control-outline: "#d4d4d8"
  day-meta-grey: "#71717a"
  day-ink-2: "#52525b"
  day-ink-3: "#3f3f46"
  day-series-grey: "#8a8a93"
  day-bench-grey: "#a1a1aa"
  day-sidebar-accent: "#f1f1f3"
  day-up-text: "#007a45"
  day-down-text: "#d12d35"
  day-up-line: "#009456"
  day-down-line: "#e5484d"
  day-down-fill: "#fdecec"
  day-caution: "#b45309"
  day-caution-fill: "#fdf6ec"
  day-caution-line: "#f3dfc1"
  day-economy: "#1d5fae"
typography:
  hero:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: "52px"
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  greeting:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "44px"
    fontWeight: 400
    lineHeight: "52px"
    letterSpacing: "-0.01em"
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "30px"
  question:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: "30px"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "24px"
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  emph:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "24px"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "17px"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "17px"
  hoot-prose:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: "27px"
rounded:
  sm: "3.6px"
  md: "4.8px"
  lg: "6px"
  logo: "5px"
  panel: "8px"
  xl: "8.4px"
  track: "10px"
  composer: "12px"
  pill: "28px"
  full: "9999px"
spacing:
  page-top: "28px"
  page-side: "40px"
  page-bottom: "96px"
  header: "56px"
  tab-row: "44px"
  panel-header: "44px"
  table-head: "40px"
  control: "30px"
  segment: "28px"
  rail-row: "34px"
  card-pad: "16px"
  strip-pad: "18px"
  tab-gap: "20px"
  rail-gap: "36px"
  sidebar: "248px"
  rail: "300px"
  reading-column: "760px"
  thread-column: "840px"
  answer-panel: "480px"
  chart: "220px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "30px"
  button-secondary:
    backgroundColor: "{colors.secondary-fill}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "30px"
  button-ghost:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "30px"
  segment-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "28px"
  segment-inactive:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "28px"
  view-switcher:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.track}"
    padding: "3px"
  input:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  find-field:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "36px"
  rail-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.composer}"
    padding: "16px"
    width: "300px"
  ask-box:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.emph}"
    rounded: "{rounded.composer}"
  ask-pill:
    backgroundColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    height: "46px"
  thread-composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "10px 10px 10px 20px"
    width: "760px"
  panel-outlined:
    rounded: "{rounded.panel}"
  holding-logo:
    backgroundColor: "{colors.day-paper}"
    rounded: "{rounded.logo}"
    size: "20px"
  holding-logo-header:
    backgroundColor: "{colors.day-paper}"
    rounded: "{rounded.track}"
    size: "40px"
  status-word:
    typography: "{typography.caption}"
    textColor: "{colors.meta-grey}"
  status-word-caution:
    textColor: "{colors.caution}"
  status-word-overdue:
    textColor: "{colors.down}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    typography: "{typography.emph}"
    width: "248px"
  page-head:
    backgroundColor: "{colors.page}"
    typography: "{typography.body}"
    height: "56px"
  hoot-corner:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.full}"
    size: "52px"
  answer-panel:
    backgroundColor: "{colors.surface}"
    width: "480px"
  command-palette:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.composer}"
    width: "640px"
---

# Design System: Owl Fund

<!-- Provenance: this look was designed and approved on the design canvas https://claude.ai/artifact/YBn5mhMTKHNrv2GLA4R3YG, first as the page "New look" (the white world, PRs #161–#167 and #168), then as the page "Perplexity direction", which made a Perplexity-style night theme the default and cut the app to five screens. It did not come from generated comps. Tokens below are taken from the shipped code (src/app/globals.css `.dark` and `:root`, src/app/layout.tsx, and the shared parts in src/components/app) on branch claude/design-overhaul-049e19, commits 615986a through ce11223. -->

## Overview

**Creative North Star: "The Brokerage Book, Asked at Night"**

Owl Fund is a student-run fund's book, read at a desk during market hours. The look joins two things. From consumer brokerages it takes the portfolio page: one big number, one big chart, and a sentence saying why it moved. From Perplexity it takes the frame: a warm-grey night page, a quiet sidebar of places and threads, and a large box to ask in. The structure underneath is still Linear's: sections split by 1px hairlines, not boxes, with ink as the only strong colour.

The app is five screens. **Home** is a place to ask: Hoot's face, a serif greeting, one sentence on the book, and the ask box with questions about today. A **Thread** reads like a Perplexity answer: the question as a heading, Answer / Sources / Steps tabs, and Hoot's serif prose. **All threads** is the list of them. A **Holding** and the **Portfolio** open with their number and the sentence that explains it, with a 300px rail of cards on the right. **Markets** is the week's calendar of earnings and economic releases, with its own rail. The **Screener** (added with the Proactive Screener spec) follows Markets' layout: a lede sentence, list tabs (Worth a look, Filing changes, Pitches, Watchlist) with the team menu in the header, the list, and a 300px rail; one company's page follows the Holding's header (40px logo, 22px name, tabs) with Hoot's cited prose in his serif. What needs you lives in the bell, not on Home.

Density is high but quiet. Six text sizes, tabular figures everywhere, greys for anything that isn't the point. Colour has a job or it doesn't appear: green and red for up and down, one amber for "check this", and a blue word for an economic release. The dark theme is the default; the white "New look" is still selectable and maps role for role.

These looks were rejected and should not come back: cream/charcoal, Fidelity/Schwab boxiness, a dark terminal or Bloomberg look, editorial/newspaper, soft fintech cards everywhere, and a dashboard of panels. The night theme is Perplexity's warm greys, not a terminal: no neon, no mono body text, no grid of panels. The app is desktop-only.

**Key Characteristics:**
- Dark by default: a #191A1A page, a #1F2121 sidebar, #202222 raised surfaces, #2D2F2F hairlines, #E8E8E6 ink. The white world is the light option.
- Hairlines instead of boxes. The one boxed thing is the raised surface: right-rail cards and the boxes you ask Hoot in.
- One big number (44px, 700) plus a 220px chart and a sentence on Portfolio and Holding.
- Geist and Geist Mono with tabular figures; Source Serif 4 only for Hoot's words.
- Status is always a word, never a dot. Green and red mean up and down; amber means check this; overdue is red.
- Company logos wherever a holding is a row or a header.
- Accounting format everywhere: negatives in parentheses, bp for relative figures, % for returns.

## Colors

The palette is warm near-black greys with one light ink. The only hues are signals, each with one meaning.

### Primary
- **Ink** (ink, #E8E8E6 at night, day-ink #0A0A0A by day): all body text, primary buttons, the active segment and filter chip, the active tab's underline, the focus ring, and the fund's own chart series. Hoot has no accent colour; he is recognised by his face.

### Secondary (signals)
- **Up Green** (up): a figure that went up, in text and in chart strokes. It means nothing else. By day the text and line split (day-up-text, day-up-line).
- **Down Red** (down): a figure that went down, and anything overdue: an overdue count, the bell's badge when something is overdue, a tab count with an overdue item. down-fill is the only chart fill, under a drawdown.
- **Check Amber** (caution): stale, held, missing, failed, and the bell's badge when nothing is overdue. It goes on the word. caution-fill sits behind a whole notice, and caution-line frames a notice that needs you (a holding's overdue write-ups).
- **Economy Blue** (economy): the word "Economy" on a Markets row, to tell a release from an earnings report. Nowhere else.

### Neutral
- **Page** (page): the page and the page header.
- **Surface** (surface): the raised surface: rail cards, the ask boxes and thread composer, popovers, the palette, the answer panel and Hoot's corner.
- **Sidebar** (sidebar): the sidebar band, a hair lighter than the page.
- **Secondary Fill** (secondary-fill): secondary buttons, hovered menu items and segments, the selected sidebar row, kbd chips, citation chips, and the letter tile of a logo that hasn't loaded.
- **Row Divider** (row-divider): the hairline between table, list and rail rows.
- **Section Divider** (section-divider): under the page header, under a table's column row, around a stat strip, the sidebar's edge and footer rule, and the resting border of an ask box.
- **Control Outline** (control-outline): input outlines, underline find fields, and an ask box's border on focus.
- **Meta Grey** (meta-grey, 5.5:1 on the page; day-meta-grey 4.8:1 on white): labels, column headers, as-of notes, breadcrumbs, key hints and neutral status words.
- **Ink 2 / Ink 3** (ink-2, ink-3): secondary text, the book sentence under the greeting, unselected controls and thread titles in the sidebar.
- **Series Greys** (series-grey, bench-grey): benchmarks, replays and comparison lines in charts.

### Day (light theme, selectable)
The New look: white paper, a #FAFAFA sidebar and surface, zinc greys, ink #0A0A0A, and the signals darkened to read on white (day-up-text, day-down-text, day-caution, day-economy). Every role maps one to one through the CSS variables; there are no day-only roles.

### Named Rules
**The Up-and-Down Rule.** Green and red appear only for a signed figure: up or down, gain or loss, above or below zero. Red also marks anything overdue, everywhere. Nothing else gets them: not success, not "open", not a brand accent.

**The One Amber Rule.** Anything needing a second look (stale, held, missing, failed) uses the same amber and always comes with a word. An error or a failure is amber with the word ("Failed", "Hoot isn't set up yet"), never red.

**The Word-First Rule.** Every status is a word in 12px semibold, coloured by tone. Never a colour alone, a status dot, or a filled pill. The only filled badge is the bell's count.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist, weights 400 / 500 / 600 / 700
**Label/Mono Font:** Geist Mono, 400 / 500, for key hints (⌘J, ⌘K) and tickers typed as input
**Hoot's voice:** Source Serif 4, 400 / 500 / 600 plus italic

**Character:** A neutral grotesk set at its tabular setting, tightened as it grows, so columns of money line up and the hero number reads as one solid shape. The serif is Hoot's voice and nothing else, which lets a reader tell at a glance which words are his.

### Hierarchy
- **Hero** (700, 44px / 52px, −0.035em, tabular): the single number that opens Portfolio or a Holding. One per page.
- **Greeting** (Source Serif 4, 400, 44px / 52px, −0.01em): Hoot's "Good afternoon, Rikhil." on Home. The same step as the hero, in his voice.
- **Display** (600, 22px / 30px): a holding's name beside its logo, a Markets heading, a view's headline figure, sign-in and dialog titles.
- **Question** (500, 22px / 30px, −0.015em): the question heading a thread's turn.
- **Title** (700, 17px / 24px, −0.01em): section headings. At 600 and −0.02em it is the **figure** in a stat strip.
- **Emph** (15px / 24px): the line under a big number, the ask box, the sidebar's rows, reading text.
- **Body** (13px / 20px): tables, lists, controls, buttons, breadcrumbs, tabs, rail rows. A rail card's title is 13px semibold.
- **Caption** (12px / 17px): the floor. Labels, meta, counts, status words. Grey unless it is a status.
- **Hoot prose** (Source Serif 4, 17px / 27px, ink at 92%): Hoot's answers, notes and empty-state questions.

### Named Rules
**The Six Steps Rule.** Only six sizes exist: 12, 13, 15, 17, 22 and 44px. Hierarchy comes from moving a whole step, or from weight, face and colour. An arbitrary `text-[Npx]` fails lint (owl/type-scale), and a test pins globals.css to the codemod's scale.

**The Serif Is Hoot Rule.** Source Serif 4 sets Hoot's own words (his answers, his greeting, his questions to you) and nothing else. It is not for headings, marketing text or quotations from documents.

**The Accounting Rule.** Every figure and date goes through the shared formatter (a guard test fails on hand-rolled `toFixed` / `toLocaleString` / `Intl.DateTimeFormat`). Negatives go in parentheses with the unit inside: "(0.29%)", "(2 bp)", "($1,234.50)". A change carries a plus when it's up. Relative figures are in "bp", never "bps". Returns are in %.

**The No-Middot Rule.** Parts of a line are joined with commas and periods, as in a sentence: "Tue, Sep 29. Market open, closes in 2h 48m. Prices delayed 15 min". Never a "·" separator.

## Layout

The shell is a sticky 248px sidebar and one content column. The sidebar can be hidden (⌘\) and remembers it. Each page opens with a 56px header: a breadcrumb (grey crumbs, then the page's name), an optional scope switcher, a grey as-of note, and at most one primary action, with an optional 44px tab row, over a section divider. It bleeds to the content area's edges. Home has no header: a thin right-aligned line gives the date, the market and how fresh prices are.

The page body is padded 28px from the top, 40px at the sides and 96px at the bottom for Hoot's corner. Full-height pages (a thread) opt out with a full-bleed marker.

**Book pages** (Portfolio, a Holding, Markets) put the page in a flexible main column with a 300px rail 36px to its right. Portfolio's frame is the brokerage stack: the grey label, the 44px number, the 15px sentence, a 220px chart with its range row, a five-cell stat strip, then a view switcher (Positions, Performance, Exposure, Risk, What if, Activity) and the view. Only Positions has the rail; the other views take the full width. A Holding opens with its 40px logo and 22px name, the 44px price and change, its tabs, then the sections, with the rail of Fund position and Next report cards. Markets lists days in a 100px date column beside the day's rows.

**Conversation pages** centre a column: Home's 760px, 70px under the top line; a thread's 840px article with a 760px composer floating 24px above the bottom edge; All threads a 760px list under a find field.

The app is desktop-only. There is no mobile guidance.

### Named Rules
**The Number-Sentence-Table Rule.** A book page opens with its number and the sentence that explains it, then the detail. A page never opens with a grid of panels.

**The Bell Rule.** What needs you is the bell's, in the sidebar footer. Home has no "Needs you" section; a holding shows only its own.

## Elevation & Depth

The page is flat. Depth comes from tone and hairlines: the raised surface is one step lighter than the page (#202222 on #191A1A), dividers are 1px rules, and an outlined panel is a 1px ring with no fill. Shadows are kept for things that float over the page: Hoot's corner, its tip and note, the ⌘K/⌘J palette, the answer panel, menus, and a thread's floating composer. Rail cards and Home's ask box cast none.

### Shadow Vocabulary
- **Hairline ring** (`box-shadow: 0 0 0 1px var(--border)`): the outlined panel. Structural, not lifted.
- **Floating composer** (`0 10px 30px rgb(0 0 0 / 0.18)`): a thread's pill composer over the answer.
- **Corner lift** (`0 4px 14px rgb(10 10 10 / 0.10)`, rising to `0 10px 24px rgb(10 10 10 / 0.16)` with a 2px lift on hover): Hoot's corner button.
- **Tip** (`0 6px 18px rgb(10 10 10 / 0.08–0.18)`): Hoot's note and the ⌘J tooltip beside the corner.
- **Palette** (`0 24px 60px rgb(10 10 10 / 0.28), 0 2px 6px rgb(10 10 10 / 0.08)`, over a scrim): the ⌘K / ⌘J palette.
- **Answer panel** (`-16px 0 40px rgb(10 10 10 / 0.08)`): the right-hand slide-in.

### Named Rules
**The Flat Page Rule.** Anything that is part of the page has no shadow. Only something floating above it casts one.

## Shapes

Corners are small and consistent. Every control (button, segment, filter chip, input, menu item, sidebar row) uses 6px. An outlined panel uses 8px and dialogs 8.4px. The raised surface uses 12px (`rounded-composer`): rail cards, the holding ask box and the ⌘J palette. The Portfolio's view switcher sits in a 10px surface track. A thread's floating composer is a 28px pill and Portfolio's one-line ask is fully round. Logo tiles are 5px at 20px and 10px at 40px. Hoot's face and avatars are circles. Tabs have no shape: the active one is underlined.

### Named Rules
**The No-Box Rule.** A section of a page is set apart by its title and the space around it, not by a frame. One exception: the raised surface, filled #202222 with 12px corners and no border or shadow, for the cards in a page's right rail and for the boxes you ask Hoot in. Page sections are never boxed, cards never nest, and a table or editor gets only the 1px panel ring.

## Components

### Buttons
Flat and quiet: ink when it's the one thing to do, grey otherwise.
- **Shape:** 6px corners, 30px tall (28px small, 24px extra-small, 36px large), 13px medium label, 16px icons.
- **Primary:** ink fill with page-coloured text. A page has at most one, in its header.
- **Secondary / Outline:** secondary-fill with ink text. No outlined buttons are drawn.
- **Ghost:** bare Ink 3 text that gains the grey fill on hover.
- **Destructive:** the grey button; its word says what it removes. Red is never used for a destructive action.
- **Hover / Focus:** primary lightens 18% toward the page, grey darkens 6% toward ink. Focus is a 2px ink outline offset 2px.

### Segmented controls and filter chips
- **Style:** 28px tall, 6px corners, 13px semibold. The chosen option is filled ink, the rest bare words with a grey hover. Range buttons (1D 1W 1M 3M 1Y All), filter chips and the Portfolio's view switcher (in its 10px surface track, 3px in) share this look.
- **State:** link segments carry `aria-current`, button segments `aria-pressed`. A guard test fails on hand-rolled tabs or segments.

### Tabs
- **Style:** 13px labels 20px apart (22px on a holding and in the header). The active tab is 600 ink and underlined; inactive tabs are grey. A count sits beside the label in 12px semibold: grey for a count, ink when it needs action, red when something is overdue.

### Rail cards (the raised surface)
- **Style:** the surface fill, 12px corners, 16px inside, no border. A 13px semibold title with an optional grey aside (a link or count), then label/value rows at least 34px tall split by row dividers, and an optional grey note.
- **Where:** only in a page's 300px right rail, stacked 18–22px apart: Portfolio Positions (ask, Moving the book today, the last session, the team), a Holding (Fund position, Next report), Markets (Today, Prep packs, book sensitivity).

### Ask boxes and composers
- **Home's ask box:** the surface fill, a section-divider border that strengthens on focus, a 15px textarea at least 64px tall, a scope chip and send button in its foot, and "Ask about today" questions below a hairline as 44px rows with a search icon.
- **Holding ask:** the same surface box at 12px, with a round ink send button.
- **Portfolio ask:** a 46px fully round one-line box with Hoot's face as the send button.
- **Thread composer:** a 760px pill (28px) on the surface, floating 24px from the bottom with the floating-composer shadow.

### Holding logo
- **Style:** the company's logo on a white tile so dark marks read at night, 20px in a row (5px corners) and 40px in a holding's header (10px). Until it loads, or when there is none, the tile is secondary-fill with the ticker's first letter; never an empty square.
- **Where:** every place a holding is a row or a header: Positions, the Portfolio rail's movers, Markets rows, All threads, a pinned thread, a holding's header.

### Tables and lists
- **Style:** 13px cells, a 40px header of grey column names over a section divider, rows split by row dividers. A hovered row takes the band fill. Outer cells pad 16px.
- **Behaviour:** a clicked row tints at once; after 150ms a 2px ink bar slides along its bottom edge while the next page loads (still under reduced motion).

### Inputs / Fields
- **Style:** 32px tall, 6px corners, 1px control-outline border. Find fields (All threads, Markets) are a bare 36px underline with a search icon.
- **Focus:** the border turns ink. No glow.
- **Error:** an invalid value turns the border amber (the destructive token), with amber words saying why.

### Navigation (sidebar)
- **Style:** a 248px sidebar band with a right hairline, rows in 15px. From the top: Hoot's mark and "Owl Fund" with Search (⌘K) and hide; **New** (a round grey plus, ⌘J) which goes Home; **Portfolio** and **Markets** with line icons; a grey **Threads** label that opens All threads, over the conversations newest first (13px, a ticker in semibold ink before the title). The active row takes the secondary fill with 8px corners. The 48px footer holds the account menu (name, role and team, preferences, theme) and the bell.
- **Bell:** a line bell with a count badge, amber, or red when something is overdue. Its popover is the "Needs you" list.

### Hoot corner, ⌘J palette and answer panel (signature)
- **Corner:** a 52px circle with Hoot's face, 28px from the right and 24px from the bottom, with the corner lift. Hover shows "Ask Hoot ⌘J". It hides wherever the page has its own ask box (Home, threads, Portfolio Positions, a holding, a write-up), during the tour, and while the palette is open.
- **Palette:** 120px from the top, 640px wide to ask and 800px to search, 12px corners, a 60px input row, grouped result rows and a footer of key hints.
- **Answer panel:** a 480px panel sliding in from the right in 220ms ease-out (instant under reduced motion), Hoot's serif prose and a compact composer.

### Thread turn (signature)
- **Style:** the question as a 22px heading, Answer / Sources / Steps tabs, then "Hoot answered at 1:14 PM" in grey beside his 22px face, the answer in Hoot prose with 18px round citation chips (amber when the source is unavailable), "Open in …" links, and Related questions under the last answer. Sources are a numbered list on their own tab; the Answer tab shows no source cards.

## Do's and Don'ts

### Do:
- **Do** build on the CSS variables so both themes work; dark (#191A1A) is the default and never hard-code a hex into a component.
- **Do** open every page but Home with PageHead: breadcrumb, grey as-of note, and at most one ink primary action.
- **Do** put a book page's story in the hero: the 44px number, the 15px sentence, the 220px chart, then a stat strip.
- **Do** put rail content in RailCard on the surface fill, 12px corners, in the 300px right rail.
- **Do** show a HoldingLogo wherever a holding is a row or a header.
- **Do** write every status as a word in 12px semibold: grey for neutral, amber for check/stale/held/failed, red for overdue.
- **Do** join parts of a line with commas and periods.
- **Do** format every figure through the shared formatter: negatives in parentheses, "bp" for relative figures, "%" for returns.
- **Do** keep one Hoot per screen: hide the corner where the page has its own ask box, and set his words in Source Serif 4.

### Don't:
- **Don't** use "·" separators or status dots.
- **Don't** put a "Needs you" section on Home, or source cards on a thread's Answer tab.
- **Don't** use green or red for anything but up, down and overdue.
- **Don't** colour an error or failure red; it is amber with a word (`destructive` is amber in this world).
- **Don't** box page sections, nest cards, shadow a card, or build a dashboard of equal panels. The raised surface is for rail cards and ask boxes only.
- **Don't** bring back cream/charcoal, Fidelity/Schwab boxiness, a dark terminal or Bloomberg look, an editorial/newspaper look, or soft fintech cards everywhere.
- **Don't** use a size outside the six-step scale, or set anything but Hoot's words in serif.
- **Don't** use chart gradients. The only chart fill is down-fill under a drawdown.
- **Don't** design phone layouts. The app is desktop-only.
