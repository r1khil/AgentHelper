import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["exceljs", "yahoo-finance2", "postgres", "unpdf", "mammoth", "mailauth"],
  // Pages from before the five screens (Home, threads, a holding, the Portfolio and Markets), for bookmarks and old
  // emails. The query carries over (a period, lookback, tab or trade means the same on the new page). Redirects that
  // depend on the reader (Backtesting's remembered scope, the calendars' filters) are the old pages themselves.
  async redirects() {
    const to = (source: string, destination: string, extra: object = {}) => ({ source, destination, permanent: false, ...extra });
    return [
      to("/attribution", "/t/fund/performance"),
      to("/attribution/ledger", "/t/fund/activity"),
      to("/daily", "/t/fund/performance?period=today"),
      to("/risk", "/t/fund/risk"),
      to("/exposure", "/t/fund/exposure"),
      to("/t/:team/attribution", "/t/:team/performance"),
      to("/t/:team/daily", "/t/:team/performance?period=today"),
      // Research: its list is Home and the sidebar's threads, every chat is a thread, a board is the holding's Threads tab.
      to("/t/:team/agent", "/"),
      to("/t/:team/agent/h/:ticker", "/hoot/:chat", { has: [{ type: "query", key: "chat", value: "(?<chat>.+)" }] }),
      to("/t/:team/agent/h/:ticker", "/t/:team/h/:ticker?tab=threads"),
      to("/t/:team/agent/:chat((?!h$)[^/]+)", "/hoot/:chat"),
      // Movement write-ups were removed; alert and reminder emails linked here.
      to("/t/:team/movements", "/t/:team"),
      to("/t/:team/movements/:id", "/t/:team"),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
