/** Only whole, explicit UI requests are commands. Research prose is left untouched. */
export type HootCommand =
  | { kind: "theme"; theme: "light" | "dark" | "system" | "toggle" }
  /** `destination` is the page's name in the sidebar's hidden links (nav.ts `hoot`); `query` a view of it. */
  | { kind: "navigate"; destination: string; query?: string }
  | { kind: "scope"; scope: string };

// What members call a page, today's names and the names of pages that moved into the five screens (Sep 29, 2026).
const destinations: Record<string, string> = {
  home: "Home", dashboard: "Home", today: "Home", hoot: "Home", "ask hoot": "Home", new: "Home",
  portfolio: "Portfolio", overview: "Portfolio", holdings: "Portfolio", positions: "Portfolio",
  performance: "Performance", attribution: "Performance", risk: "Risk", exposure: "Exposure",
  activity: "Activity", ledger: "Activity", trades: "Activity",
  "what if": "What if", backtesting: "What if", backtest: "What if",
  markets: "Markets", market: "Markets", earnings: "Markets", calendar: "Markets", "earnings calendar": "Markets", "economic calendar": "Markets", "economic releases": "Markets",
  threads: "Threads", "all threads": "Threads", research: "Threads", chat: "Threads", chats: "Threads", conversations: "Threads", agent: "Threads", boards: "Threads", "research boards": "Threads",
  "write ups": "Write-ups", writeups: "Write-ups", movements: "Write-ups",
  models: "Models", "sell side": "Sell-side calls", "sell side calls": "Sell-side calls", "sell side analyzer": "Sell-side calls",
  "weekly update": "Weekly update", changelog: "Changelog", "what's new": "Changelog", admin: "Admin", administration: "Admin",
};

/** Views of a page, by name: today's performance is Performance with the period Today. */
const views: Record<string, { destination: string; query: string }> = {
  daily: { destination: "Performance", query: "?period=today" },
  "daily performance": { destination: "Performance", query: "?period=today" },
  "today's performance": { destination: "Performance", query: "?period=today" },
  "performance today": { destination: "Performance", query: "?period=today" },
};

export function parseHootCommand(text: string): HootCommand | null {
  const q = text.toLowerCase().trim().replace(/[.!?]+$/, "").replace(/[-–]/g, " ").replace(/\s+/g, " ")
    .replace(/^(?:hey )?hoot[, ]+/, "").replace(/^(?:can|could|would) you /, "")
    .replace(/^please /, "").replace(/,? please$/, "");
  const mode = "(light|dark|system) (?:mode|theme)";
  const enable = q.match(new RegExp(`^(?:(?:switch|change|set)(?: me| the (?:site|website))? to |(?:enable|use|activate|turn on) )${mode}$`))
    ?? q.match(new RegExp(`^turn ${mode} on$`));
  if (enable) return { kind: "theme", theme: enable[1] as "light" | "dark" | "system" };
  const disable = q.match(/^(?:turn off|disable) (light|dark) (?:mode|theme)$/) ?? q.match(/^turn (light|dark) (?:mode|theme) off$/);
  if (disable) return { kind: "theme", theme: disable[1] === "light" ? "dark" : "light" };
  if (/^(?:toggle|switch) (?:the )?(?:(?:light|dark) mode|theme)$/.test(q)) return { kind: "theme", theme: "toggle" };
  // A sector is a short name ending in "sector"/"team"; prepositions mean it's a research question about one.
  const sector = "(?!.*\\b(?:for|in|of|on|at|with|and|about|from|by|the|my|our|your|this|that)\\b)([a-z&']+(?: [a-z&']+){0,2}) (?:sector|team)";
  const scope = q.match(new RegExp(`^(?:switch|change|toggle)(?: me)? to (?:the )?(?:(whole fund)|${sector})$`))
    ?? q.match(new RegExp(`^(?:take me to|bring me to|go to|navigate to|open|show me|filter to) (?:the )?${sector}$`));
  if (scope) return { kind: "scope", scope: scope[1] ?? scope[2] };
  const navigation = q.match(/^(?:take me to|bring me to|go to|navigate to|open) (?:the )?(.+?)(?: page| section| area| view)?$/);
  if (!navigation) return null;
  const view = views[navigation[1]];
  if (view) return { kind: "navigate", ...view };
  const destination = destinations[navigation[1]];
  return destination ? { kind: "navigate", destination } : null;
}

export type HootLink = { label: string; href: string };
/** Routes come from the member's scoped sidebar, never from user-provided URLs. */
export function commandHref(destination: string, links: HootLink[]): string | null {
  const href = links.find((link) => link.label === destination)?.href;
  return href && /^\/(?!\/)/.test(href) && !/[\\\s]/.test(href) ? href : null;
}

/** Match only a rendered, accessible scope option. No generated team slugs or arbitrary URLs. */
export function scopeHref(scope: string, links: HootLink[]): string | null {
  const requested = scope.toLowerCase().trim();
  const link = links.find(({ label }) => label.toLowerCase() === requested || (requested === "fund" && label === "Whole fund"));
  return link ? commandHref(link.label, links) : null;
}
