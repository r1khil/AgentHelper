import { Segmented } from "@/components/app/panel";
import { LOOKBACKS, type LookbackKey } from "@/lib/risk/model";

/** Short label for a lookback on the segmented control, e.g. "1Y". */
export const lookbackShort = (k: LookbackKey) => k.toUpperCase();

/** The lookback windows as range buttons; `extra` keeps other query parameters (a sector view) across a change. */
export function LookbackSelector({ basePath, active, extra = "" }: { basePath: string; active: LookbackKey; extra?: string }) {
  return (
    <Segmented
      label="Lookback window"
      segments={(Object.keys(LOOKBACKS) as LookbackKey[]).map((k) => ({ key: k, label: lookbackShort(k), title: LOOKBACKS[k].label, href: `${basePath}?lookback=${k}${extra}`, active: k === active }))}
    />
  );
}
