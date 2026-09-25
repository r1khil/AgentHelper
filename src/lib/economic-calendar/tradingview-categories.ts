/** TradingView's category codes and the labels events carry. A module of its own so client code can read it without the provider. */
export const TRADINGVIEW_CATEGORY: Record<string, string> = {
  bnd: "Bonds",
  bsnss: "Business",
  cnsm: "Consumer",
  enrg: "Energy",
  gdp: "GDP",
  gov: "Government",
  hse: "Housing",
  lbr: "Labor",
  mny: "Money",
  mrkt: "Markets",
  prce: "Prices",
  trd: "Trade",
};

/** The category labels TradingView events carry, so other modules can tell them from other providers' categories. */
export const TRADINGVIEW_CATEGORIES: ReadonlySet<string> = new Set(Object.values(TRADINGVIEW_CATEGORY));
