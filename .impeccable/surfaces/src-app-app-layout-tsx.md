---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: []
---

# Owl Fund app shell and pages — the "New look"

Scope: every signed-in screen of Owl Fund (Operate mode), plus sign-in and onboarding. Audience: execs, admins and lead analysts of a student-run fund, at a desk, daytime, often with the market open. Associate access is on hold.

Source of truth: the approved design canvas https://claude.ai/artifact/YBn5mhMTKHNrv2GLA4R3YG, pages "App spec" and "New look". The user approved this world over several rejected rounds; the world is not re-rolled.

Provenance: the look came from that approved canvas, drawn and approved there artboard by artboard, not from generated comps or plates. The build (PRs #161–#167) produced no new rasters; Hoot's face and poses in public/hoot/ predate it (Blender renders from the Sep 22 mascot work). DESIGN.md at the repo root records the system as shipped.

## Direction contract

THESIS: A brokerage-grade book (one big number, one big chart, a line explaining it) with Linear's structure: hairlines, not boxes. Refuses the dashboard-of-panels grammar, cream/charcoal, boxed rounded cards, and a Hoot column on every page.

OWN-WORLD: White page, #FAFAFA sidebar, zinc greys (#F4F4F5 dividers and secondary controls, #EDEDED section rules, #71717A meta), ink #0A0A0A for text, primary buttons and selection. Green #007A45 / red #D12D35 text for up/down only, chart green #009456 / red #E5484D, one amber #B45309 for check/stale/held/failed. Geist + Geist Mono, tabular figures; Source Serif 4 for Hoot's own words. 6px radius controls, 12px composer.

STORY: Every page opens with its number and the sentence that explains it, then what needs you, then the detail table. Status is always a word, never colour alone.

FIRST VIEWPORT: Portfolio Overview — $4.46M hero, 220px line chart (dashed grey replay before Sep 17, green ledger after), range buttons, six-stat hairline strip.

SIGNATURE: Hoot lives in the bottom-right corner (real face), ⌘J opens a palette scoped to the page, answers slide in from the right; conversation pages (Home, Research, threads) read like Claude and Perplexity.

RISK: Restyling primitives globally can leave old pages half-converted; each page PR must land its artboard's layout, not just new colours.
