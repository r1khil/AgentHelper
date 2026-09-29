---
name: Owl Fund
description: The fund's book at a desk. A white page, hairlines not boxes, one big number and the sentence that explains it.
colors:
  ink: "#0a0a0a"
  paper: "#ffffff"
  band: "#fafafa"
  secondary-fill: "#f4f4f5"
  row-divider: "#f4f4f5"
  section-divider: "#ededed"
  control-outline: "#d4d4d8"
  panel-ring: "#e4e4e7"
  meta-grey: "#71717a"
  ink-2: "#52525b"
  ink-3: "#3f3f46"
  series-grey: "#8a8a93"
  bench-grey: "#a1a1aa"
  up-text: "#007a45"
  down-text: "#d12d35"
  up-line: "#009456"
  down-line: "#e5484d"
  down-fill: "#fdecec"
  caution: "#b45309"
  caution-fill: "#fdf6ec"
  sidebar-accent: "#f1f1f3"
  sidebar-border: "#ebebee"
  night-background: "#09090b"
  night-popover: "#131316"
  night-band: "#111114"
  night-secondary: "#1f1f23"
  night-divider: "#26262b"
  night-row: "#1a1a1e"
  night-ink: "#fafafa"
  night-meta: "#a1a1aa"
  night-up-text: "#3dd68c"
  night-down-text: "#ff6369"
  night-up-line: "#2fbf71"
  night-down-line: "#f2555a"
  night-caution: "#f0a64a"
  night-caution-fill: "#2a1e10"
typography:
  hero:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: "52px"
    letterSpacing: "-0.035em"
    fontFeature: "tnum"
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "30px"
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
  panel: "8px"
  xl: "8.4px"
  composer: "12px"
  full: "9999px"
spacing:
  page-top: "32px"
  page-side: "40px"
  page-bottom: "96px"
  header: "52px"
  tab-row: "44px"
  panel-header: "44px"
  table-head: "40px"
  control: "30px"
  segment: "28px"
  strip-pad: "18px"
  tab-gap: "20px"
  sidebar: "232px"
  reading-column: "760px"
  answer-panel: "480px"
  chart: "220px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
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
  button-destructive:
    backgroundColor: "{colors.secondary-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "30px"
  segment-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "28px"
  segment-inactive:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    padding: "16px 16px 12px"
  panel-outlined:
    rounded: "{rounded.panel}"
  status-word:
    typography: "{typography.caption}"
    textColor: "{colors.meta-grey}"
  status-word-caution:
    textColor: "{colors.caution}"
  status-word-overdue:
    textColor: "{colors.down-text}"
  sidebar:
    backgroundColor: "{colors.band}"
    width: "232px"
  hoot-corner:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.full}"
    size: "52px"
  answer-panel:
    backgroundColor: "{colors.paper}"
    width: "480px"
  command-palette:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    width: "640px"
---

# Design System: Owl Fund

<!-- Provenance: this look was designed and approved on the design canvas https://claude.ai/artifact/YBn5mhMTKHNrv2GLA4R3YG (pages "App spec" and "New look"), over several rejected rounds. It did not come from generated comps. Tokens below are taken from the shipped code (src/app/globals.css and the shared primitives in src/components/app) at main a784ca0, after new-look PRs #161–#167. -->

## Overview

**Creative North Star: "The Brokerage Book, Ruled in Hairlines"**

Owl Fund is a student-run fund's book, read at a desk during market hours. The look joins two things. From consumer brokerages it takes the portfolio page: one big number, one big chart, and a sentence saying why it moved. From Linear it takes the structure: a white page divided by 1px hairlines, not boxes, with ink as the only strong colour. Conversation surfaces (Home, Research, Hoot threads) read like Claude or Perplexity instead: a centred 760px column, a large composer, and Hoot's own words set in a serif. Every page follows the same order: its number and the sentence explaining it, then what needs you, then the detail table.

Density is high but quiet. Six text sizes, tabular figures everywhere, greys for anything that isn't the point. Colour has a job or it doesn't appear: green and red for up and down, one amber for "check this". Hoot, the fund's AI, has no column on the page. He is a face in the bottom-right corner, a ⌘J palette, and an answer panel that slides in from the right.

These looks were rejected and should not come back: cream/charcoal, boxed rounded cards, Fidelity/Schwab boxiness, a dark terminal, editorial/newspaper, soft fintech cards, and a dashboard of panels. The app is desktop-only, so there is no phone layout.

**Key Characteristics:**
- White page, a #FAFAFA sidebar band, zinc greys, ink (#0A0A0A) for text, primary buttons and selection.
- Hairlines instead of boxes: #EDEDED section dividers, #F4F4F5 row dividers, and a 1px ring only around a panel you act on.
- One big number (44px, 700) plus a 220px chart and a sentence on portfolio pages.
- Geist and Geist Mono with tabular figures; Source Serif 4 only for Hoot's words.
- Status is always a word. Green and red mean up and down; amber means check this.
- Accounting format everywhere: negatives in parentheses, bp for relative figures, % for returns.

## Colors

The palette is monochrome zinc on white. The only hues are three signals, each with one meaning.

### Primary
- **Ink** (ink): all body text, primary buttons, the active segment and filter chip, the active tab's 2px underline, the focus ring, and the fund's own chart series. Hoot's accent colour is ink too. His old pink is gone, and he is recognised by his face, not a colour.

### Secondary (signals)
- **Up Green**: text (up-text) and chart strokes (up-line) for a figure that went up. It means nothing else.
- **Down Red**: text (down-text) and chart strokes (down-line) for a figure that went down, plus an overdue count. The pale down-fill is the only chart fill, used under a drawdown.
- **Check Amber** (caution): the one warning colour, for stale, held, missing, and failed. It goes on the status word. caution-fill appears only behind a whole notice, never behind a status.

### Neutral
- **Paper** (paper): the page, panels, popovers, the answer panel and the composer.
- **Band** (band): the sidebar, the palette's footer and preview column, and a hovered or selected table row.
- **Secondary Fill** (secondary-fill): secondary buttons, the hover state of menu items and bare segments, the scope switcher, and kbd chips.
- **Row Divider** (row-divider): the hairline between table and list rows.
- **Section Divider** (section-divider): under the page header, under a table's column row, above and below a stat strip, and the outlined panel's ring.
- **Control Outline** (control-outline): input outlines and the composer's frame. It turns ink on focus.
- **Meta Grey** (meta-grey, 4.8:1 on white): labels, column headers, as-of notes, breadcrumbs above the page name, and neutral status words.
- **Ink 2 / Ink 3** (ink-2, ink-3): secondary text, and unselected controls and nav items.
- **Series Greys** (series-grey, bench-grey): benchmarks, replays and comparison lines in charts.

### Night (dark mode, shipped)
The same world at night: zinc blacks (night-background #09090B, night-popover for raised surfaces, night-band for the sidebar), the same hairline structure (night-divider, night-row), ink flipped to #FAFAFA, and the signals lifted so they stay readable (night-up-text, night-down-text, night-caution). Every role maps one to one through the CSS variables. There are no night-only roles.

### Named Rules
**The Up-and-Down Rule.** Green and red appear only for a signed figure: up or down, gain or loss, above or below zero. Red may also mark an overdue count. Nothing else gets them: not success, not "open", not a brand accent.

**The One Amber Rule.** Anything needing a second look (stale, held, missing, failed) uses the same amber and always comes with a word. A failure is amber with the word "Failed", never red.

**The Word-First Rule.** Every status is a word in 12px semibold, coloured by tone. Never use a colour alone, a dot alone, or a filled pill.

## Typography

**Display Font:** Geist (with ui-sans-serif, system-ui)
**Body Font:** Geist, weights 400 / 500 / 600 / 700
**Label/Mono Font:** Geist Mono, 400 / 500, for key hints (⌘J, esc) and tickers typed as input
**Hoot's voice:** Source Serif 4, 400 / 500 / 600 plus italic

**Character:** A neutral grotesk set at its tabular setting, tightened as it grows, so columns of money line up and the hero number reads as one solid shape. The serif is Hoot's voice and nothing else, which lets a reader tell at a glance which words are his.

### Hierarchy
- **Hero** (700, 44px / 52px, −0.035em, tabular): the single number that opens a page. There is one per page.
- **Display** (600, 22px / 30px): item titles on a detail page, sign-in, and dialog titles.
- **Title** (700, 17px / 24px, −0.01em): panel and section headings. The same size at 600 and −0.02em is the **figure** in a stat strip.
- **Emph** (15px / 24px): the line under the big number, reading text, and inputs before they shrink to body.
- **Body** (13px / 20px): everything in a table, list, control, button, breadcrumb or tab. The page's own name in the header is a 13px semibold h1.
- **Caption** (12px / 17px): the floor. Labels, meta, column groups, counts and status words. Grey unless it is a status.
- **Hoot prose** (Source Serif 4, 17px / 27px, ink at 92%): Hoot's answers, notes and greeting.

### Named Rules
**The Six Steps Rule.** Only six sizes exist: 12, 13, 15, 17, 22 and 44px. Hierarchy comes from moving a whole step, or from weight and colour. An arbitrary `text-[Npx]` fails lint (owl/type-scale), and a test pins globals.css to the codemod's scale.

**The Serif Is Hoot Rule.** Source Serif 4 sets Hoot's own words and nothing else. It is not for headings, marketing text or quotations from documents.

**The Accounting Rule.** Every figure and date goes through the shared formatter (a guard test fails on hand-rolled `toFixed` / `toLocaleString` / `Intl.DateTimeFormat`). Negatives go in parentheses with the unit inside: "(0.29%)", "(2 bp)", "($1,234.50)". A change carries a plus when it's up. Relative figures (active weight, moves against the benchmark) are in "bp", never "bps". Returns are in %.

## Layout

The shell is a sticky 232px sidebar band on the left and one content column. Each page starts with a 52px header row: a breadcrumb (grey crumbs, then the page name as a 13px semibold heading), an optional scope switcher ("Whole fund ▾"), a grey as-of note, and at most one primary action. Under it is an optional 44px tab row (tabs 22px apart), and the whole header sits over a section divider. It bleeds to the edges of the content area.

The page body is padded 32px from the top, 40px at the sides, and 96px at the bottom to leave room for Hoot's corner button. Full-height workspaces (a research board, a thread) opt out with a full-bleed marker. Sections stack with about 20px gaps (the fill column uses 20px). There are no side-by-side dashboard grids of equal panels.

**Portfolio pages** follow the brokerage stack: the grey label, the 44px number, the explaining sentence in 15px, a 220px edge-to-edge line chart with range buttons, then a stat strip of equal cells between two hairlines (18px vertical padding, no dividers between cells), then the detail table.

**Conversation pages** (Home, Research, threads) centre a 760px reading column with a large composer, Hoot's prose above it, and no page chrome beyond the header.

The app is desktop-only. The answer panel is designed around the roughly 1045px content pane that remains beside the sidebar, and there is no mobile guidance.

### Named Rules
**The Number-Sentence-Table Rule.** A page opens with its number and the sentence that explains it, then what needs you, then the detail. A page never opens with a grid of panels.

## Elevation & Depth

The page is flat. Depth comes from hairlines and bands, not shadows: dividers are 1px rules, an outlined panel is drawn with a 1px ring in the section-divider colour and no fill, and a stat strip's cell dividers are inset 1px lines. Real shadows are reserved for things that float above the page and belong to Hoot or the shell: the corner button, its tip and note, the ⌘K/⌘J palette, and the answer panel. In night mode those shadows deepen, and the palette gains a 1px ring so its edge still shows.

### Shadow Vocabulary
- **Hairline ring** (`box-shadow: 0 0 0 1px var(--border)`): the outlined panel. Structural, not lifted.
- **Corner lift** (`0 4px 14px rgb(10 10 10 / 0.10)`, rising to `0 10px 24px rgb(10 10 10 / 0.16)` with a 2px lift on hover): Hoot's corner button.
- **Tip** (`0 6px 18px rgb(10 10 10 / 0.08–0.18)`): Hoot's note and the ink ⌘J tooltip beside the corner.
- **Palette** (`0 24px 60px rgb(10 10 10 / 0.28), 0 2px 6px rgb(10 10 10 / 0.08)`, over a 28% ink scrim): the ⌘K / ⌘J command palette.
- **Answer panel** (`-16px 0 40px rgb(10 10 10 / 0.08)`): the right-hand slide-in.

### Named Rules
**The Flat Page Rule.** Anything that is part of the page has no shadow. Only something floating above the page (Hoot's corner, the palette, the answer panel, menus) casts one.

## Shapes

Corners are small and consistent. Every control (button, segment, filter chip, input, scope switcher, menu item) uses a 6px radius, and 24px-tall controls use a slightly smaller one. An outlined panel uses 8px. Dialogs use 8.4px (the 6px base times 1.4). The places you type to Hoot, the ask box, the thread composer and the ⌘J palette, use 12px (`rounded-composer`), the one large corner in the app. Hoot's face, avatars and the market dot are full circles. Tabs don't have shapes: the active tab is marked by a 2px ink underline drawn as an inset shadow.

### Named Rules
**The No-Box Rule.** A section of a page is set apart by its 17px title and the space around it, not by a frame. Only an object you act on (a table, an editor) gets the 1px panel ring. There are no filled cards and no nested frames.

## Components

### Buttons
Flat and quiet: ink when it's the one thing to do, grey otherwise.
- **Shape:** 6px corners, 30px tall (28px small, 24px extra-small, 36px large), 13px medium label, 16px icons.
- **Primary:** ink fill with white text. A page has at most one, in its header.
- **Secondary / Outline:** grey fill (#F4F4F5) with ink text. The new look draws no outlined buttons, so the "outline" variant renders as secondary.
- **Ghost:** bare Ink 3 text that gains the grey fill on hover.
- **Destructive:** the grey button; its word says what it removes ("Remove", "Void"). Menu items that remove things look like any other item. Red is never used for a destructive action.
- **Hover / Focus:** primary lightens 18% toward the page and grey darkens 6% toward ink. Focus shows a 2px ink outline offset by 2px. Disabled buttons get a control-outline fill with Ink 2 text.

### Segmented range buttons and filter chips
- **Style:** 28px tall, 6px corners, 13px semibold. The chosen option is filled ink and the rest are bare words, with a grey fill on hover. Range buttons (1D 1W 1M 3M 1Y All) and filters ("Needs attention · 3") share this look.
- **State:** link segments carry `aria-current` and button segments carry `aria-pressed`. A guard test fails on hand-rolled tabs or segments outside the shared controls.

### Tabs
- **Style:** 13px labels spaced 20px apart (22px in the header). The active tab is 600 ink with a 2px ink underline, inactive tabs are 500 grey. An optional count sits beside the label in 12px semibold: grey when it is just a count, ink when it needs action, red only when something in it is overdue.

### Panels and stat strip
- **Outlined panel:** 8px corners, a 1px section-divider ring, no fill. Its header is 44px tall over a hairline, with a 17px bold title, an optional count and a grey aside on the right.
- **Plain panel:** no frame. The title sits flush with the page edge.
- **Stat strip:** equal cells between two hairlines. Each has a 12px grey label, a 17px figure (up green or down red only when signed), and a 12px grey note. A cell can link to the page it summarises.

### Tables
- **Style:** 13px cells, a 40px header row of grey regular-weight column names over a section divider, and rows split by #F4F4F5 row dividers. A hovered or expanded row takes the band fill. Outer cells pad 16px.
- **Behaviour:** a clicked row tints immediately. If the next page is slow, after 150ms a 2px ink bar slides along the row's bottom edge (it stays still under reduced motion). Div grids carry table roles, and a guard test checks the semantics.

### Inputs / Fields
- **Style:** 32px tall, 6px corners, 1px control-outline border on white.
- **Focus:** the border turns ink. There is no glow.
- **Error:** a red border for an invalid value.

### Navigation (sidebar)
- **Style:** a 232px #FAFAFA band with a right hairline. From the top: the owl glyph and name, "Ask Hoot ⌘J", "Search ⌘K", grouped nav rows (13px, with the active row filled in the sidebar accent), a teams list with each team's day move in green or red, a "Manage" group, and a market line at the foot ("Market open · 2:41 PM ET") beside a small ink dot, grey when the market is closed.

### Hoot corner, ⌘J palette and answer panel (signature)
- **Corner:** a 52px white circle with Hoot's real face (40px), fixed 28px from the right and 24px from the bottom, with the corner lift shadow. On hover or focus an ink tooltip reads "Ask Hoot ⌘J". A note from Hoot appears as a small white card with an amber dot on the face.
- **Palette:** opens 120px from the top, 640px wide in ask mode and 800px in search mode, with the 12px composer corner. It has a 60px input row in 17px, grouped 38px result rows that take the grey fill when selected, a band-coloured preview column (280px), and a 40px band footer of key hints plus the line "Hoot finds and cites the evidence. The conclusions stay yours." In ask mode the search icon becomes Hoot's face and the page's context shows as a grey chip.
- **Answer panel:** a 480px white panel sliding in from the right in 220ms ease-out (instant under reduced motion). It has a 56px header ("Hoot", a grey context chip, open-as-thread and close) over a hairline, Hoot's serif prose, and a compact composer at the foot.
- **Composer:** the 12px corner, a control-outline border that turns ink on focus, 16px padding, and a round ink send button.

### Hero
- **Style:** a 13px grey label, the 44px hero figure, then one 15px line with the signed change in semibold green or red followed by a grey note.

## Do's and Don'ts

### Do:
- **Do** open every page with PageHead: breadcrumb, grey as-of note, and at most one ink primary action.
- **Do** put a portfolio page's story in the hero: the 44px number, the 15px sentence, the 220px chart, then a stat strip.
- **Do** write every status as a word in 12px semibold: grey for done or neutral, amber (#B45309) for check/stale/held/failed, red only for overdue.
- **Do** format every figure through the shared formatter: negatives in parentheses, "bp" for relative figures, "%" for returns.
- **Do** keep Hoot to the corner face, ⌘J and the slide-in answer panel, with his words in Source Serif 4.
- **Do** make anything that emails people ask first and name its recipients ("Send to 6 people: …", with a "Send to me only" option).
- **Do** carry the night tokens through the CSS variables. Never hard-code a day hex into a component.

### Don't:
- **Don't** use green or red for anything but up, down and overdue: not success, not "open", not a live dot, not a destructive-looking status.
- **Don't** colour a failure red. Failures and error messages are amber with a word; the `destructive` token is amber in this world.
- **Don't** add a Hoot column or sidebar to a page.
- **Don't** box sections into filled or shadowed cards, or build a dashboard of equal panels.
- **Don't** bring back cream/charcoal, a dark terminal, an editorial/newspaper look, soft fintech cards, or Fidelity/Schwab boxiness.
- **Don't** use a size outside the six-step scale, or set anything but Hoot's words in serif.
- **Don't** use chart gradients. The only chart fill is the pale red under a drawdown.
- **Don't** design phone layouts. The app is desktop-only.
