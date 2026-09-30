// The fixed vocabulary of the filing-change detector (Module 3): what the model may call a change, and which 8-K item
// codes are flagged by code alone. Keys are stored in filing_changes.label; the text is what people read.

/** Labels for a change between a 10-K or 10-Q and the right earlier filing. The model picks from these only. */
export const CHANGE_LABELS = {
  new_risk_factor: "New risk factor",
  /** Code emits this one itself when a section disappeared or shrank by more than half. */
  section_shrunk: "Section removed or shrunk",
  critical_estimates: "Critical accounting estimates",
  non_gaap_drift: "Non-GAAP drift",
  customer_concentration: "Customer concentration",
  /** Material weakness, remediation. */
  controls: "Controls",
  liquidity: "Liquidity and going concern",
} as const;

export type ChangeLabel = keyof typeof CHANGE_LABELS;

export function isChangeLabel(x: unknown): x is ChangeLabel {
  return typeof x === "string" && Object.hasOwn(CHANGE_LABELS, x);
}

/**
 * 8-K item codes that signal trouble, flagged with no model at all. `label` is what filing_changes.label holds for
 * the row (a key, so the (accession, item, label) unique index dedupes reruns).
 */
export const EIGHT_K_ITEMS = {
  "4.01": { label: "auditor_change", text: "Auditor change" },
  "4.02": { label: "non_reliance", text: "Non-reliance on prior financial statements (restatement)" },
  "2.04": { label: "debt_acceleration", text: "Debt acceleration or triggering event" },
  "2.06": { label: "material_impairment", text: "Material impairment" },
} as const;

export type EightKCode = keyof typeof EIGHT_K_ITEMS;

/** Display text for any stored label: a change label, an 8-K label, or null (still queued). */
export function labelText(label: string | null | undefined): string {
  if (!label) return "Waiting to be labeled";
  if (isChangeLabel(label)) return CHANGE_LABELS[label];
  for (const v of Object.values(EIGHT_K_ITEMS)) if (v.label === label) return v.text;
  return label.replace(/_/g, " ");
}

/** "KRE 10-Q: new risk factor", the one-line title a flag carries. */
export function flagTitle(ticker: string, form: string, label: string | null): string {
  const text = labelText(label);
  return `${ticker} ${form}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}
