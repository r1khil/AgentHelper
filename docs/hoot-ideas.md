# Hoot: ideas for later

Hoot shipped in #51: the floating companion, quick ask, nudges, inline thinking state and the 3D hero. This file collects what could come next. Nothing here is built. Each idea should keep the rules Hoot already follows:
- He only speaks up for something that matters, and no more than once per page or three times per session.
- He never writes a member's thesis or update for them.
- Anyone can hide him.

## Morning card
The first time a member opens the app after 6am New York time, Hoot shows a small card (not a bubble). It lists overnight moves in the team's holdings against the S&P futures, today's earnings and economic releases, and any write-up due today. One tap dismisses it for the day. The data already exists in the morning job, the earnings calendar and the economic calendar.

## Source check before submitting
When a member submits a movement write-up or an earnings reflection, Hoot highlights sentences with a number or a claim but no citation. He asks "Want the agent to find a source for these?" and never rewrites the text. Keep this to a lightweight, client-side check first. Use the agent only if the member asks.

## Celebrations, sparingly
A brief happy hop and one line when:
- the fund beats the S&P for the week (Friday close);
- a member closes their first movement write-up;
- a thesis update gets accepted.

Never on losses, and nothing that reads like cheering on a position.

## First-week tour
New analysts get a short guided walk from Hoot: Today, a holding, its research board, Movements, Earnings. It's one card per page, continues across visits, and can be skipped. It should build on `TOUR_CARDS` in `src/lib/onboarding.ts` rather than duplicate it.

## Smarter nudges
- **Stale thesis:** a holding the member owns whose thesis hasn't changed in 90 days, or since two earnings reports.
- **Reflection due:** earnings reported more than two days ago and the reflection is still empty.
- **Big mover, no owner:** an open movement with no owner a few hours before it's due (leads and execs only).
- **Weekly reply outstanding:** execs who haven't answered the weekly process-update ask by Friday.

## Page-aware quick ask
Let pages register context with Hoot (ticker, movement date, earnings period), so suggestions can be specific. For example: "Why did AMZN move on 9/22 versus the S&P?" instead of the generic movements prompts. The research board and the movement and earnings detail pages are the obvious first callers.

## Ambient polish
- Hoot looks toward the part of the page that changed when live quotes or a finished job update it.
- A "reading" pose (a small book or a magnifying glass) for long agent runs and Drive ingestion, rendered from the same Blender script.
- A dark-mode render pass (rim light tuned for dark backgrounds) for when the app turns dark mode on.
- A seasonal or event accessory (earnings-season visor, year-end hat) as an extra sprite layer, if it stays tasteful.

## Measuring whether he helps
Track quick-ask opens, nudge clicks versus dismissals, and how often people hide him, per role. If more than about 20% of a role hides him, his proactivity is wrong for that role. Tune the bubble rules before adding any new feature.
