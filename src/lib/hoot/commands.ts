/** Only whole, explicit UI requests are commands. Research prose is left untouched. */
export type HootCommand = { kind: "theme"; theme: "light" | "dark" | "system" | "toggle" } | { kind: "navigate"; destination: string };

const destinations: Record<string, string> = {
  home: "Today", dashboard: "Today", today: "Today", portfolio: "Holdings", holdings: "Holdings",
  hoot: "Hoot", chat: "Hoot", research: "Hoot", "sell side": "Sell-side analyzer", "sell side analyzer": "Sell-side analyzer",
  models: "Models", movements: "Movements", earnings: "Earnings", calendar: "Economic calendar",
  "economic calendar": "Economic calendar", attribution: "Attribution", risk: "Risk", exposure: "Exposure",
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
  const navigation = q.match(/^(?:take me to|bring me to|go to|navigate to|open|show me) (?:the )?(.+?)(?: page| section| area)?$/);
  const destination = navigation && destinations[navigation[1]];
  return destination ? { kind: "navigate", destination } : null;
}

export type HootLink = { label: string; href: string };
/** Routes come from the member's scoped sidebar, never from user-provided URLs. */
export function commandHref(destination: string, links: HootLink[]): string | null {
  const href = links.find((link) => link.label === destination)?.href;
  return href && /^\/(?!\/)/.test(href) && !/[\\\s]/.test(href) ? href : null;
}
