import { fmtAccounting } from "@/lib/format";

/**
 * A figure in accounting style, as Today has used since Sep 25: losses in parentheses, no plus sign. Positives
 * carry a hidden ")" so a right-aligned column lines up on its digits. The caller picks the color.
 */
export function Acct({ value, digits = 2, unit = "" }: { value: number | null | undefined; digits?: number; unit?: string }) {
  const text = fmtAccounting(value, digits, unit);
  return (
    <>
      {text}
      {!text.startsWith("(") && text !== "—" && <span className="invisible" aria-hidden>)</span>}
    </>
  );
}
