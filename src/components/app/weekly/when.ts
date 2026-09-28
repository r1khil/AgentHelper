import { fmtDateTime } from "@/lib/format";

/** When the pack was built: "Sun 27 Sep, 12:00 ET". */
export function whenBuilt(iso: string): string {
  return fmtDateTime(iso);
}
