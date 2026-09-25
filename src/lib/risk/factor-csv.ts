import { FACTOR_KEYS, FACTORS, isFactorReport, type FactorFit, type FactorReport, type FactorUnavailable } from "./factors";

/**
 * The Exposure page's factor section as CSV rows. `factorBetaRows` is every regression's coefficients;
 * `factorReturnRows` is the exact data they were fitted on, so any row can be reproduced with
 * LINEST(y, the seven factor columns, TRUE, TRUE). LINEST lists the slopes in reverse column order.
 */

const fitCells = (x: FactorFit) => [
  ...FACTOR_KEYS.flatMap((k) => [x.betas[k].beta, x.betas[k].se, x.betas[k].t]),
  x.alpha.beta,
  x.alpha.se,
  x.alpha.t,
  x.r2,
  x.adjR2,
  x.n,
  x.df,
  x.residualVol,
];

export function factorBetaRows(f: FactorReport | FactorUnavailable): unknown[][] {
  if (!isFactorReport(f)) return [["note"], [f.reason]];
  const header = ["row", "symbol", "weight", "source", "proxy", ...FACTOR_KEYS.flatMap((k) => [`${k}_beta`, `${k}_se`, `${k}_t`]), "alpha_daily", "alpha_se", "alpha_t", "r2", "adj_r2", "n", "df", "residual_vol_ann", "window_from", "window_to"];
  const tail = [f.sample.from, f.sample.to];
  return [
    header,
    ...f.holdings.map((h) => ["holding", h.ticker, h.weight, h.source, h.proxy ?? "", ...fitCells(h), ...tail]),
    ["portfolio", "", f.holdings.reduce((s, h) => s + h.weight, 0), "", "", ...fitCells(f.fund), ...tail],
    ...(f.benchmark ? [["benchmark", "", 1, "", "", ...fitCells(f.benchmark), ...tail]] : []),
    ...(f.active ? [["active", "", "", "", "", ...fitCells(f.active), ...tail]] : []),
    ...FACTORS.map((x) => ["factor_definition", x.key, "", "", "", x.definition]),
  ];
}

export function factorReturnRows(f: FactorReport | FactorUnavailable): unknown[][] {
  if (!isFactorReport(f)) return [["note"], [f.reason]];
  const bench = f.inputs.benchmark;
  return [
    ["date", ...FACTOR_KEYS.map((k) => `factor_${k}`), "portfolio", ...(bench ? ["benchmark", "active"] : []), ...f.holdings.map((h) => h.ticker)],
    ...f.sample.dates.map((d, t) => [
      d,
      ...FACTOR_KEYS.map((k) => f.inputs.factors[k][t]),
      f.inputs.portfolio[t],
      ...(bench ? [bench[t], f.inputs.portfolio[t] - bench[t]] : []),
      ...f.inputs.holdings.map((col) => col[t]),
    ]),
  ];
}
