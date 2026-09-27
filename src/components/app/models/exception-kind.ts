/** A short pill label for why a proposal needs judgment (see lib/models/proposals.ts). */
export function exceptionKind(reason: string | null) {
  const r = reason ?? "";
  if (r.startsWith("Restated")) return "Restated";
  if (r.startsWith("Only a year-to-date")) return "YTD only";
  if (r.startsWith("Concept ")) return "Not reported";
  if (r.startsWith("Unit ")) return "Unit";
  if (/need 3 to derive Q4/.test(r)) return "Q4 not derivable";
  if (r.startsWith("No ")) return "No fact";
  return "Exception";
}
