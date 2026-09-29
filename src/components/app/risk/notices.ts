import type { QualityNotice } from "../attribution/data-quality-notice";

/** The model's plain-language notices, with a link to where an exec can fix each one. */
export function riskNotices(notices: string[], opts: { canEdit: boolean }): QualityNotice[] {
  return notices.map((text) => {
    if (!opts.canEdit) return { text };
    if (text.startsWith("No S&P 500 sector weights")) return { text, href: "/t/fund/activity?tab=benchmark", action: "Add weights" };
    if (text.includes("Set a sector on the ledger")) return { text, href: "/t/fund/activity?tab=securities", action: "Classify" };
    return { text };
  });
}
