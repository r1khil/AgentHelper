import type { Tour } from "./types";

/**
 * Hoot's tour of the Sep 27, 2026 redesign (the rail, section tabs, ⌘K and every page's new layout), for execs and
 * admins (the only people who see every section, Manage included). It replaced the Sep 25 what's-new tour, so a new
 * id offers it once more to everyone who finished that one.
 * Copy rules: plain English, say where things moved before what they do, and name where any new figure comes from.
 * Keep each line to a sentence or two; the pages' own tooltips carry the detail.
 */
export const WHATS_NEW_TOUR_ID = "new-look-2026-09-27";

/** What the offer card says the tour covers. */
export const WHATS_NEW_PITCH = {
  title: "Want a quick tour of the new look?",
  again: "Still up for a tour of the new look?",
  body: "The Owl's Nest got a redesign: a slim menu on the left, each section's pages as tabs along the top, ⌘K to jump anywhere, and every page laid out again. I'll show you where everything went. It takes about 6 minutes.",
};

// Said the same way everywhere, so the member learns each source once.
const QUOTES = "Prices are live quotes from Yahoo Finance.";
const CLOSES = "Daily closing prices from Yahoo Finance, saved every weekday evening after the market closes.";
const LEDGER = "What the fund owns comes from the trade ledger, replayed to the latest close.";

const nav = (id: string) => `[data-tour="nav-${id}"]`;
/**
 * A header tab of a rail section. From another section the rail item is lit instead (clicking it opens the
 * section, then the tab lights up); the rail item stops matching once its section is open.
 */
const tab = (id: string, section: string) => `${nav(id)}, ${nav(section)}:not([aria-current])`;

export const WHATS_NEW_TOUR: Tour = {
  id: WHATS_NEW_TOUR_ID,
  chapters: [
    {
      id: "menu",
      label: "Getting around",
      route: /^\//,
      steps: [
        {
          id: "rail",
          kind: "info",
          target: '[data-tour="sidebar"]',
          title: "Five places, one slim menu",
          body: "Today, Holdings, Research, Calendar and Portfolio, with Manage near the bottom. Pages that used to have their own line in the menu are now tabs along the top of their section: Movements and Models under Holdings, Sell-side calls under Research, Risk, Exposure and Backtesting under Portfolio.",
        },
        {
          id: "scope",
          kind: "info",
          target: '[data-tour="scope"]',
          title: "Whose numbers you're looking at",
          what: "This tile under the logo says whose holdings every page is showing. \"Fund\" is everyone.",
          how: "Click it to narrow the whole app to one sector team.",
        },
        {
          id: "command",
          kind: "info",
          target: '[data-tour="command"]',
          title: "⌘K goes anywhere",
          what: "Type a ticker to open that holding, a page's name to jump there, or a question to start a research chat with me.",
          how: "Click the box or press ⌘K (Ctrl K on Windows) from any page. Arrow keys pick, Enter goes.",
        },
      ],
    },
    {
      id: "today",
      label: "Today",
      route: /^\/$/,
      steps: [
        {
          id: "go-today",
          kind: "go",
          target: nav("today"),
          title: "Today, built around what needs you",
          body: "On the left: my list for you and how each team did. On the right: the last session, my evening brief and what's coming up.",
          prompt: "Click Today in the menu.",
        },
        {
          id: "today-greeting",
          kind: "info",
          target: '[data-tour="today-greeting"]',
          title: "The day in one line",
          what: "The market clock, then one sentence from me: how the fund did last session and how many things are waiting for you.",
          how: "Once the tour's over I sit right here, beside the greeting, instead of in the corner. Click me to ask a research question.",
        },
        {
          id: "today-list",
          kind: "info",
          target: '[data-tour="today-list"]',
          title: "My list for you",
          what: "Everything waiting on you, most urgent first: write-ups due, expectations to set before earnings, model values to review, new sell-side calls and the weekly pack. Each one says when it's due.",
          how: "Click a line to deal with it, or × to clear it. The list refreshes every 5 minutes.",
          source: "The app's own records: open movements, the earnings calendar, uploaded models and the weekly pack.",
        },
        {
          id: "today-teams",
          kind: "info",
          target: '[data-tour="today-teams"]',
          title: "Teams, by what they added",
          what: "Each team's return last session and what it added to the fund, with a bar that grows right for a gain and left for a loss, and the team's biggest mover. The team that added most comes first.",
          how: "Open a team to see each holding's price, today's move against the S&P 500, next report and owner.",
          source: `${LEDGER} ${QUOTES}`,
        },
        {
          id: "today-result",
          kind: "info",
          target: '[data-tour="today-result"]',
          title: "The last session, in the dark card",
          what: "The fund's return next to the S&P 500 and the difference, then my written brief underneath.",
          how: "Losses are in parentheses, like an accountant would write them.",
          source: `${LEDGER} ${CLOSES} I write the brief at 5:05 pm ET.`,
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "holdings",
      label: "Holdings",
      route: /^\/t\/[^/]+$/,
      steps: [
        {
          id: "go-holdings",
          kind: "go",
          target: nav("holdings"),
          title: "Holdings is one table now",
          body: "Every holding in one list, grouped by team, with what needs doing right on the row.",
          prompt: "Click Holdings in the menu.",
        },
        {
          id: "holdings-filters",
          kind: "info",
          target: '[data-tour="holdings-filters"]',
          title: "Filter to what matters",
          what: "Needs attention, Reporting in 2 weeks and Unassigned, each with a count. The S&P 500's move today sits on the right.",
          how: "Needs attention turns pink when a write-up is overdue.",
        },
        {
          id: "holdings-table",
          kind: "info",
          target: '[data-tour="holdings-table"]',
          title: "Every holding at a glance",
          points: [
            { label: "Team rows", text: "each team's share of the fund and its move today. Click one to fold it away." },
            { label: "5 days", text: "a small chart of the last five closes." },
            { label: "Needs attention", text: "what's waiting on the holding: a write-up, expectations, model values, a proposed thesis." },
          ],
          source: `${QUOTES} The 5-day line uses stored closing prices; weights are the saved holding weights.`,
        },
      ],
    },
    {
      id: "holding",
      label: "A holding",
      route: /^\/t\/[^/]+\/h\/[^/]+$/,
      steps: [
        {
          id: "go-holding",
          kind: "go",
          target: '[data-tour="holdings-table"] [role="row"] a[href*="/h/"]',
          title: "Each holding has its own page",
          body: "Let's open one.",
          prompt: "Click any holding in the table.",
        },
        {
          id: "holding-tabs",
          kind: "info",
          target: 'nav[aria-label="Holding sections"]',
          title: "Everything about it, in tabs",
          points: [
            { label: "Overview", text: "the price chart, the thesis, notes, the key figures and the latest news and filings." },
            { label: "Research", text: "your research chats with me about this company." },
            { label: "Documents & filings", text: "the Drive folder and SEC filings, with my summaries." },
            { label: "Earnings", text: "the next report and expectations." },
            { label: "Notes", text: "the team's notes." },
          ],
          how: "\"Ask Hoot about…\", under the company's name, starts a research chat about it.",
        },
        {
          id: "holding-scope",
          kind: "info",
          target: '[data-tour="scope"]',
          title: "Now showing this holding's team",
          what: "Opening a holding narrows the app to its team, so the next few pages show that team's numbers.",
          how: "Pick Fund here any time to see the whole fund again.",
        },
      ],
    },
    {
      id: "movements",
      label: "Movements",
      route: /^\/t\/[^/]+\/movements(\/[^/]+)?$/,
      steps: [
        {
          id: "go-movements",
          kind: "go",
          target: tab("movements", "holdings"),
          title: "Movements: the list and the write-up side by side",
          prompt: "Click Movements along the top.",
        },
        {
          id: "movements-list",
          kind: "info",
          target: '[data-tour="movements-list"]',
          title: "Every big move",
          what: "A movement opens when a holding beats or trails the S&P 500 by 4 percentage points or more in a day. The write-up is due at noon the next trading day.",
          how: "Pick one on the left and it opens on the right, without leaving the page.",
          source: `${CLOSES} Checked every night after the close.`,
        },
        {
          id: "movement-detail",
          kind: "info",
          target: '[data-tour="movement-detail"]',
          title: "Evidence, your update, my feedback",
          what: "The news, filings and peer moves I gathered, the box for your update, and my feedback in pink.",
          how: "I flag claims without support, missing evidence and anything that contradicts the thesis. I never rewrite your update. Models, the next tab, works the same way: the list on the left, proposed values from new filings to approve or reject on the right.",
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "research",
      label: "Research",
      route: /^\/t\/[^/]+\/agent$/,
      steps: [
        {
          id: "go-research",
          kind: "go",
          target: nav("research"),
          title: "Research, in three columns",
          body: "Your chats on the left, the conversation in the middle, the sources on the right.",
          prompt: "Click Research in the menu.",
        },
        {
          id: "research-list",
          kind: "info",
          target: '[data-tour="research-list"]',
          title: "Your chats",
          what: "Every research chat, with search and New at the top: each holding's board, then general questions.",
        },
        {
          id: "research-ask",
          kind: "info",
          target: '[data-tour="ask-hoot"]',
          title: "Ask me here",
          what: "Ask for evidence: I pull prices, SEC filings, financials, news, economic data and your team's notes, with a source on every fact.",
          how: "Inside a chat, the sources I used fill the right-hand column. Try one of these:",
          examples: ["What moved our biggest holding this week?", "Summarize the latest 10-Q for our largest position."],
        },
        {
          id: "research-side",
          kind: "info",
          target: '[data-tour="research-side"]',
          title: "Research boards",
          what: "One card per holding: its chats and sources, an open movement, and the next report.",
          how: "Sell-side calls, the next tab, is where you record an analyst call and get my brief beside it.",
        },
      ],
    },
    {
      id: "calendar",
      label: "Calendar",
      route: /^\/t\/[^/]+\/(earnings|economic-calendar)$/,
      steps: [
        {
          id: "go-calendar",
          kind: "go",
          target: nav("calendar"),
          title: "One calendar for earnings and releases",
          body: "Our holdings' reports, bellwethers and the big economic releases share one week.",
          prompt: "Click Calendar in the menu.",
        },
        {
          id: "calendar-week",
          kind: "info",
          target: '[data-tour="calendar-week"]',
          title: "The week",
          what: "Every report and release this week, day by day. Switch to Month or List at the top right.",
          how: "Click a release to see what's expected and why it matters for us. On a weekend it opens on the coming week.",
          source: "Earnings dates from Finnhub and Yahoo Finance. The release schedule from TradingView.",
        },
        {
          id: "calendar-side",
          kind: "info",
          target: '[data-tour="calendar-side"]',
          title: "Pick what to show",
          points: [
            { label: "Month", text: "dots mark days with reports or releases. Click a day to jump to its week." },
            { label: "Show", text: "turn holdings, bellwethers and releases on or off, and filter releases by importance." },
            { label: "Expectations this week", text: "who still has to set expectations before their company reports. They lock when the report lands." },
          ],
        },
      ],
    },
    {
      id: "portfolio",
      label: "Portfolio",
      route: /^(\/t\/[^/]+)?\/attribution$/,
      steps: [
        {
          id: "go-portfolio",
          kind: "go",
          target: nav("portfolio"),
          title: "Portfolio: the book's own numbers",
          body: "Attribution, Risk, Exposure and Backtesting now live together.",
          prompt: "Click Portfolio in the menu.",
        },
        {
          id: "portfolio-tabs",
          kind: "info",
          target: '[data-tour="section-tabs"]',
          title: "Four pages, one row of tabs",
          what: "Attribution (where the return came from), Risk (how bumpy the fund is), Exposure (where our money sits against the index) and Backtesting (what if the weights were different).",
          how: "Every page leads with a strip of headline numbers. Hover a label for what it means.",
        },
        {
          id: "attribution-strip",
          kind: "info",
          target: '[data-tour="attribution-strip"]',
          title: "Attribution, up top",
          what: "The return and how it compares with the index and the sector benchmark; for a team, also what it added to the fund. Below: the running difference over time, where it came from (sector choices or stock picks), then sectors and holdings.",
          source: `${LEDGER} ${CLOSES}`,
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "risk",
      label: "Risk",
      route: /^(\/t\/[^/]+)?\/risk$/,
      steps: [
        {
          id: "go-risk",
          kind: "go",
          target: tab("risk", "portfolio"),
          title: "Risk, tidied up",
          prompt: "Click Risk along the top.",
        },
        {
          id: "risk-headline",
          kind: "info",
          target: 'section[aria-label="Headline risk"]',
          title: "Five numbers in one strip",
          what: "Volatility, tracking error, beta, the 1-day VaR and the worst day, all in one row.",
          how: "Pick 6 months, 1 year or 2 years of history just above it.",
        },
        {
          id: "risk-sources",
          kind: "info",
          target: '[data-tour="risk-sources"]',
          title: "Where the risk comes from, and past crashes",
          what: "The holdings carrying the most risk, with Trim 1 pp to try a smaller position in Backtesting. Beside it: how today's holdings would have done in past crashes.",
          how: "Sectors, what moves together and the full method are further down the page.",
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "backtesting",
      label: "Backtesting",
      route: /^\/backtesting$/,
      steps: [
        {
          id: "go-backtesting",
          kind: "go",
          target: tab("backtesting", "portfolio"),
          title: "Backtesting, side by side",
          prompt: "Click Backtesting along the top.",
        },
        {
          id: "bt-weights",
          kind: "info",
          target: '[data-tour="bt-weights"]',
          title: "Weights on the left, results on the right",
          what: "Dates, benchmark, a quick trade and the weights you can edit, then Run replay and Save. The replay, saved scenarios and the risk impact fill in on the right.",
          source: "It starts from the saved holding weights. Nothing changes in the real portfolio.",
          ifMissing: "skip",
        },
        {
          id: "bt-layout",
          kind: "info",
          target: '[data-tour="bt-layout"]',
          title: "Old layout or new: your pick",
          what: "This button switches Backtesting between the new layout and the classic one, just for you.",
          how: "Both use the same engine, so the numbers are the same either way.",
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "manage",
      label: "Manage",
      route: /^\/(weekly|changelog|admin)(\/|$)/,
      steps: [
        {
          id: "go-manage",
          kind: "go",
          // The classic Backtesting layout keeps the old sidebar, where Manage's pages are still separate lines.
          target: `${nav("manage")}, ${nav("weekly-update")}`,
          title: "Manage: the running of the fund",
          body: "The weekly pack, the changelog and admin, as three tabs.",
          prompt: "Click Manage near the bottom of the menu.",
        },
        {
          id: "weekly-packs",
          kind: "info",
          target: '[data-tour="weekly-packs"]',
          title: "Weekly packs",
          what: "Every Sunday's pack on the left; pick one to see its numbers, performers, earnings and releases, with the email, highlights, agenda and checks in tabs.",
          source: "I build it Sundays at noon ET from the ledger, the PT sheet and the fund calendar.",
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "wrap",
      label: "Wrap-up",
      route: /^\//,
      steps: [
        {
          id: "account",
          kind: "info",
          target: '[data-tour="account"]',
          title: "Your preferences live here",
          body: "Click your initials at the bottom of the menu for Theme (light or dark), Floating Hoot, Transparency (the math behind every number), and \"Replay the tour\" to watch this again.",
        },
      ],
    },
  ],
};
