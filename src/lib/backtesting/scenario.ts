/** Client-side helpers for editing a scenario. Weights are percentage strings as typed in the inputs. */
export type WeightInputs = Record<string, string>;

export const PRESETS = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"] as const;
export type Preset = (typeof PRESETS)[number];

/** Calendar shift that clamps to the month's last day (Mar 31 − 1M = Feb 28). */
function shift(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export function presetStart(preset: Preset, end: string) {
  if (preset === "YTD") return `${end.slice(0, 4)}-01-01`;
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "3Y": 36, "5Y": 60 }[
    preset
  ];
  // The day after the shifted date keeps "1Y" to exactly one year of sessions.
  const start = new Date(`${shift(end, months)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString().slice(0, 10);
}

export function activePreset(from: string, to: string, maxTo: string) {
  if (to !== maxTo) return null;
  return PRESETS.find((p) => presetStart(p, maxTo) === from) ?? null;
}

export const validWeight = (w: string) =>
  w.trim() !== "" &&
  Number.isFinite(Number(w)) &&
  Number(w) >= 0 &&
  Number(w) <= 100;

export const weightTotal = (weights: WeightInputs) =>
  Object.values(weights).reduce((s, w) => s + Number(w), 0);

/** Two-decimal weights whose rounding residual lands on the largest weight, so the total is exactly 100. */
function settle(entries: [string, number][]): WeightInputs {
  const rounded = entries.map(([id, w]) => [id, Math.round(w * 100)] as const);
  const residual = 10000 - rounded.reduce((s, [, w]) => s + w, 0);
  let largest = 0;
  rounded.forEach(([, w], i) => {
    if (w > rounded[largest][1]) largest = i;
  });
  return Object.fromEntries(
    rounded.map(([id, w], i) => [
      id,
      ((w + (i === largest ? residual : 0)) / 100).toFixed(2),
    ]),
  );
}

/** Scales every weight proportionally to a 100% total; null when that is impossible. */
export function scaleTo100(weights: WeightInputs): WeightInputs | null {
  const values = Object.values(weights);
  if (!values.length || !values.every(validWeight)) return null;
  const sum = weightTotal(weights);
  if (sum <= 0) return null;
  return settle(
    Object.entries(weights).map(([id, w]) => [id, (Number(w) / sum) * 100]),
  );
}

export function equalWeights(ids: string[]): WeightInputs {
  return settle(ids.map((id) => [id, 100 / ids.length]));
}

/** Saved weights as two-decimal inputs that total exactly 100, the starting point for editing. */
export function roundedWeights(
  positions: { id: string; weight: number }[],
): WeightInputs {
  return settle(positions.map((p) => [p.id, p.weight * 100]));
}

/** Inputs compare numerically against the rounded baseline, so "12.3" and "12.30" are the same weight. */
export const isEdited = (baseline: WeightInputs, inputs: WeightInputs, id: string) =>
  Number(inputs[id]) !== Number(baseline[id]);

/**
 * Decimal weights for the request. Edited holdings use the typed value; the rest keep their exact
 * saved proportions, rescaled to fill the remainder, so an unedited run matches the saved portfolio
 * exactly instead of its two-decimal rounding.
 */
export function requestWeights(
  positions: { id: string; weight: number }[],
  inputs: WeightInputs,
  baseline: WeightInputs,
): Record<string, number> {
  const edited = positions.filter((p) => isEdited(baseline, inputs, p.id));
  if (!edited.length)
    return Object.fromEntries(positions.map((p) => [p.id, p.weight]));
  const editedTotal = edited.reduce((s, p) => s + Number(inputs[p.id]) / 100, 0);
  const restExact = positions
    .filter((p) => !isEdited(baseline, inputs, p.id))
    .reduce((s, p) => s + p.weight, 0);
  const scale = restExact > 0 ? Math.max(0, 1 - editedTotal) / restExact : 0;
  return Object.fromEntries(
    positions.map((p) => [
      p.id,
      isEdited(baseline, inputs, p.id) ? Number(inputs[p.id]) / 100 : p.weight * scale,
    ]),
  );
}

/** More than two decimals is noise for a portfolio weight; trims "12.3456" to "12.35" and leaves "12.3" alone. */
export const tidyWeight = (input: string) =>
  validWeight(input) && /\.\d{3,}/.test(input) ? Number(input).toFixed(2) : input;
