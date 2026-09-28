import { fmtAccounting } from "@/lib/format";

/**
 * A figure in accounting style (see `fmtAccounting`): losses in parentheses, no plus sign. With `align`, positives
 * carry a hidden ")" so a right-aligned column of mixed signs lines up on its digits. The caller picks the color;
 * `Move` is the colored version.
 */
export function Acct({ value, digits = 2, unit = "", align = true }: { value: number | string | null | undefined; digits?: number; unit?: string; align?: boolean }) {
  const text = fmtAccounting(value, digits, unit);
  return (
    <>
      {text}
      {align && !text.startsWith("(") && text !== "—" && <span className="invisible" aria-hidden>)</span>}
    </>
  );
}
