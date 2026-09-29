---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: []
---

# Owl Fund app shell and pages — the "Perplexity direction"

Scope: every signed-in screen of Owl Fund, now five screens: Home, Thread (/hoot/[chatId]), All threads (/hoot), Holding (/t/[team]/h/[ticker]), Portfolio (/t/[team]/(portfolio)/ and its views) and Markets (/markets), plus sign-in and onboarding. Audience: execs, admins and lead analysts of a student-run fund, at a desk, daytime, often with the market open.

Source of truth: the approved design canvas https://claude.ai/artifact/YBn5mhMTKHNrv2GLA4R3YG, pages "New look" (the white world) then "Perplexity direction" (the night default and five-screen model). The world is not re-rolled.

Provenance: drawn and approved on that canvas, not from generated comps. Built on branch claude/design-overhaul-049e19 (615986a through ce11223). DESIGN.md at the repo root records the system as shipped.

## Direction contract

THESIS: A brokerage-grade book (one big number, one big chart, a line explaining it) inside Perplexity's frame (a warm-grey night page, a sidebar of places and threads, a big box to ask in), on Linear's hairline structure. Refuses the dashboard-of-panels grammar, cream/charcoal, Fidelity/Schwab boxiness, a terminal/Bloomberg dark, editorial newspaper, and soft fintech cards everywhere.

OWN-WORLD: Dark by default: #191A1A page, #202222 raised surface, #1F2121 sidebar, #2D2F2F hairlines, ink #E8E8E6, up #3DD68C / down #FF6369, one amber #F0A64A. The white New look stays selectable. Geist + Geist Mono, tabular figures; Source Serif 4 for Hoot's words. 6px controls; 12px raised surface for rail cards and ask boxes only.

STORY: Home is a place to ask; book pages open with their number and the sentence that explains it, then the detail, with a 300px rail of cards. What needs you is the bell's. Status is a word, never a dot; lines join with commas and periods.

FIRST VIEWPORT: Home — Hoot's face, "Good afternoon, Rikhil." in serif, one sentence on the book, the ask box with questions about today.

SIGNATURE: A thread reads like a Perplexity answer (question heading, Answer / Sources / Steps, serif prose with numbered chips). One Hoot per screen: the corner button hides where a page has its own ask box.

RISK: Rail-card and ask-box corners drifted between 8.4px, 10.8px and 12px during the build; new work should use RailCard and rounded-composer.
