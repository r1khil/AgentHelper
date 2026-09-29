/**
 * Document-search arguments made consistent before they reach the index. Some models (GPT-6 Luna among them) fill
 * every optional field: a filing search arrives with kind "filing" plus a Drive-only driveKind and documentType, which
 * together match nothing (and fail outright when the Drive is disconnected). Blank strings count as unset; a filing
 * search (kind "filing", or a form with no Drive filter) drops the Drive-only filters, and a Drive search drops form.
 */
export function coherentDocFilters<T extends { kind?: "drive" | "filing"; driveKind?: string; documentType?: string; form?: string }>(args: T): T {
  const blank = (v: string | undefined) => (v && v.trim() ? v : undefined);
  const out = { ...args, driveKind: blank(args.driveKind), documentType: blank(args.documentType), form: blank(args.form) };
  const filings = out.kind === "filing" || (out.kind === undefined && out.form !== undefined && args.kind !== "drive");
  if (filings) {
    out.driveKind = undefined;
    out.documentType = undefined;
  } else if (out.kind === "drive") out.form = undefined;
  for (const k of ["driveKind", "documentType", "form"] as const) if (out[k] === undefined) delete out[k];
  return out as T;
}
