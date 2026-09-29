/** Only whole, explicit UI requests are commands. Research prose is left untouched. */
export type HootCommand = { kind: "theme"; theme: "light" | "dark" | "system" | "toggle" } | { kind: "navigate"; destination: string } | { kind: "scope"; scope: string };

const destinations: Record<string, string> = {
  home: "Home", dashboard: "Home", today: "Home", portfolio: "Portfolio", overview: "Portfolio", holdings: "Holdings", positions: "Holdings",
  activity: "Activity", ledger: "Activity", trades: "Activity", performance: "Attribution",
  research: "Research", hoot: "Research", chat: "Research", chats: "Research", conversations: "Research", agent: "Research",
  boards: "Research", "research boards": "Research", "sell side": "Sell-side calls", "sell side calls": "Sell-side calls", "sell side analyzer": "Sell-side calls",
  models: "Models", movements: "Movements", earnings: "Earnings", calendar: "Economic calendar",
  "economic calendar": "Economic calendar", attribution: "Attribution", "daily performance": "Daily performance", "daily": "Daily performance", "today's performance": "Daily performance", risk: "Risk", exposure: "Exposure",
  backtesting: "Backtesting", backtest: "Backtesting", "weekly update": "Weekly update", changelog: "Changelog",
  "what's new": "Changelog", admin: "Admin", administration: "Admin",
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
  const navigation = q.match(/^(?:take me to|bring me to|go to|navigate to|open) (?:the )?(.+?)(?: page| section| area)?$/);
  const destination = navigation && destinations[navigation[1]];
  return destination ? { kind: "navigate", destination } : null;
}

/** A rail section Hoot opens by name goes where the rail does: the first of its pages this member can open. */
const SECTION_PAGES: Record<string, string[]> = { Portfolio: ["Portfolio", "Attribution", "Backtesting"], Holdings: ["Holdings", "Portfolio"] };

export type HootLink = { label: string; href: string };
/** Routes come from the member's scoped sidebar, never from user-provided URLs. */
export function commandHref(destination: string, links: HootLink[]): string | null {
  for (const name of SECTION_PAGES[destination] ?? [destination]) {
    const href = links.find((link) => link.label === name)?.href;
    if (href) return /^\/(?!\/)/.test(href) && !/[\\\s]/.test(href) ? href : null;
  }
  return null;
}

/** Match only a rendered, accessible scope option. No generated team slugs or arbitrary URLs. */
export function scopeHref(scope: string, links: HootLink[]): string | null {
  const requested = scope.toLowerCase().trim();
  const link = links.find(({ label }) => label.toLowerCase() === requested || (requested === "fund" && label === "Whole fund"));
  return link ? commandHref(link.label, links) : null;
}
