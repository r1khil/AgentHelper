import type { Tour } from "./types";

/**
 * Hoot's tour of the five screens (Sep 29, 2026: the sidebar with New, Portfolio, Markets and Threads, the bell, and
 * every old page moved onto the holding, Portfolio view or Markets it was about), for execs and admins. It keeps the
 * Sep 27 tour's id, so it is offered to nobody new; "Replay the tour" shows it, and a new id would offer it again.
 * Copy rules: plain English, say where things moved before what they do, and name where any new figure comes from.
 * Keep each line to a sentence or two; the pages' own tooltips carry the detail. Steps inside a page talk from the
 * middle of the screen, so they never wait on a part of a page that moved.
 */
export const WHATS_NEW_TOUR_ID = "new-look-2026-09-27";

/** What the offer card says the tour covers. */
export const WHATS_NEW_PITCH = {
  title: "Want a quick tour of the new look?",
  again: "Still up for a tour of the new look?",
  body: "The Owl's Nest is five screens now: Home to ask me, a thread for each answer, a page for each holding, the Portfolio and Markets. I'll show you where everything went. It takes about 3 minutes.",
};

// Said the same way everywhere, so the member learns each source once.
const QUOTES = "Prices are live quotes from Yahoo Finance.";
const LEDGER = "What the fund owns comes from the trade ledger, replayed to the latest close.";

const nav = (id: string) => `[data-tour="nav-${id}"]`;

export const WHATS_NEW_TOUR: Tour = {
  id: WHATS_NEW_TOUR_ID,
  chapters: [
    {
      id: "menu",
      label: "Getting around",
      route: /^\//,
      steps: [
        {
          id: "sidebar",
          kind: "info",
          target: '[data-tour="sidebar"]',
          title: "Five screens, one sidebar",
          body: "Home to ask me, a thread for each answer, a page for each holding, the Portfolio and Markets. The old pages moved onto the screen they were about: Models and Sell-side calls onto each holding, Attribution, Risk and Backtesting onto the Portfolio, the calendars onto Markets.",
        },
        {
          id: "command",
          kind: "info",
          target: '[data-tour="command"]',
          title: "⌘K goes anywhere",
          what: "Type a ticker to open that holding, a page's name (old names work too) to jump there, or a question to ask me.",
          how: "Click the magnifier or press ⌘K from any page. Arrow keys pick, Enter goes.",
        },
        {
          id: "new",
          kind: "info",
          target: '[data-tour="ask-hoot"]',
          title: "New: a question for me",
          what: "Opens Home, where you ask me anything. Every answer becomes a thread.",
          how: "On any other page, ⌘J asks me about what's on it.",
        },
        {
          id: "threads",
          kind: "info",
          target: '[data-tour="threads"]',
          title: "Every conversation, newest first",
          what: "Your threads with me, general ones and ones about a holding. This is what Research used to be.",
          how: "A holding's threads are also on its page, under Threads.",
          ifMissing: "skip",
        },
        {
          id: "bell",
          kind: "info",
          target: '[data-tour="bell"]',
          title: "What needs you",
          what: "Expectations to set before earnings, model values and call briefs to review, and the weekly pack, most urgent first.",
          how: "Click a line to deal with it. Each holding's page shows its own too.",
          source: "The app's own records: the earnings calendar, uploaded models, recorded calls and the weekly pack.",
          ifMissing: "skip",
        },
      ],
    },
    {
      id: "portfolio",
      label: "Portfolio",
      route: /^\/t\/[^/]+(\/(performance|risk|exposure|activity|what-if))?$/,
      steps: [
        {
          id: "go-portfolio",
          kind: "go",
          target: nav("portfolio"),
          title: "Portfolio: the book in one place",
          body: "Value, chart and every position grouped by team, with the analytics as views of the same page.",
          prompt: "Click Portfolio in the sidebar.",
        },
        {
          id: "portfolio-views",
          kind: "info",
          title: "Six views of the same book",
          points: [
            { label: "Positions", text: "every holding by team. Open a row for the holding's page." },
            { label: "Performance", text: "where the return came from, from today (what Daily showed, live) to all time. This was Attribution." },
            { label: "Risk and Exposure", text: "how bumpy the book is and where it sits against the index." },
            { label: "Activity", text: "the trade ledger and tickets to review." },
            { label: "What if", text: "replay different weights on past prices. This was Backtesting." },
          ],
          how: "The Whole fund filter at the top narrows everything to one team: that's what the team pages were. Weekly update is a button in the header.",
          source: `${LEDGER} ${QUOTES}`,
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
          target: 'main a[href*="/h/"]',
          title: "Each holding has its own page",
          body: "Let's open one.",
          prompt: "Click any holding in the table.",
        },
        {
          id: "holding-tabs",
          kind: "info",
          title: "Everything about it, in tabs",
          points: [
            { label: "Threads", text: "your conversations with me about it. This was its research board." },
            { label: "Model", text: "the Excel model and values from new filings to approve." },
            { label: "Filings & notes", text: "SEC filings, the team's documents and notes, and sell-side calls." },
            { label: "Earnings", text: "the next report, expectations and the prep pack." },
          ],
          how: "The box under the price asks me about this company. What's due on it sits at the top of the page.",
        },
      ],
    },
    {
      id: "markets",
      label: "Markets",
      route: /^\/markets$/,
      steps: [
        {
          id: "go-markets",
          kind: "go",
          target: nav("markets"),
          title: "Markets: earnings and releases together",
          body: "Our holdings' reports and the big economic releases on one schedule.",
          prompt: "Click Markets in the sidebar.",
        },
        {
          id: "markets-schedule",
          kind: "info",
          title: "The next few weeks, day by day",
          what: "The fund's reports (est. means the company hasn't confirmed the date) and the economic releases, with which prep packs are built. Add sector bellwethers at the top.",
          how: "Click a report to open its holding's Earnings tab. This replaces the Earnings and Economic releases pages.",
          source: "Earnings dates from Finnhub and Yahoo Finance. The release schedule from TradingView.",
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
          title: "What's new, Admin and your preferences",
          body: "Click your name at the bottom of the sidebar for What's new, Admin, Theme (light or dark), Hoot in the corner, Transparency (the math behind every number), and \"Replay the tour\" to watch this again.",
        },
      ],
    },
  ],
};
