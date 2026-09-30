export function returnPct(close: number, prevClose: number) {
  return 100 * (close / prevClose - 1);
}

/** A holding's daily return less the S&P 500's, in percentage points. */
export function relativeMovePp(holding: { close: number; prevClose: number }, spx: { close: number; prevClose: number }) {
  return returnPct(holding.close, holding.prevClose) - returnPct(spx.close, spx.prevClose);
}
