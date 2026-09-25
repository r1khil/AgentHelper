# Hoot website controls

Submit a direct request in floating Hoot, the Hoot landing page, or a general/holding conversation:

- “Turn on light mode” / “turn off light mode”
- “Switch to dark mode” / “use system theme” / “toggle theme”
- “Take me to holdings” / “open backtesting” / “bring me to the risk page”

Hoot confirms the action with a toast. Theme requests use the existing theme provider and its saved preference. Page requests use the current member's sidebar links, preserving team/fund scope and the existing page authorization. Unavailable destinations produce an explanation rather than a guessed URL.

These are local controls: they do not start a research run or create a conversation. Only an entire, explicit command is intercepted; questions, quoted instructions, and mixed research/action requests continue through research. Actions are never replayed from stored assistant answers. Supported destinations are the sidebar pages (Today, Backtesting, Holdings, Hoot, Sell-side analyzer, Models, Movements, Earnings, Economic calendar, Attribution, Risk, Exposure, Weekly update, Changelog, Admin), subject to availability. Arbitrary URLs and individual holding navigation are not supported.
