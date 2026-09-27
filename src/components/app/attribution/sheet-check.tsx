import { DriveNotConnected } from "@/lib/drive/auth";
import { fmtDateTime } from "@/lib/format";
import { compareWithLedger, POSITIONS_TAB, sheetQuantities, type QuantityCheck } from "@/lib/pt-sheet/reconcile";
import { ptSheetConfigured, readPtSheet } from "@/lib/pt-sheet/read";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionTitle } from "@/components/app/page-header";

const shares = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

function meaning(c: QuantityCheck): string {
  if (c.status === "sheet_only") return "In the sheet but not the ledger: a buy may be missing from the ledger.";
  if (c.status === "ledger_only") return "In the ledger but not the sheet: a sale may be missing from the ledger, or the sheet dropped it.";
  const n = shares(Math.abs(c.diff));
  return c.diff > 0 ? `The sheet has ${n} more: a buy may be missing from the ledger.` : `The ledger has ${n} more: a sale may be missing from the ledger, or the sheet is behind.`;
}

/**
 * Share counts in the price target sheet against the ledger, to catch trades nobody recorded. `positions` are the
 * ledger's recorded trades netted per ticker (no reinvested dividends). Read-only on both sides; streamed in so a slow
 * sheet read never holds up the ledger.
 */
export async function SheetCheck({ positions }: { positions: { ticker: string; shares: number }[] }) {
  if (!ptSheetConfigured()) return null;
  let sheet: Awaited<ReturnType<typeof readPtSheet>>;
  try {
    sheet = await readPtSheet();
  } catch (e) {
    return (
      <Card className="mb-6 p-4 text-sm text-muted-foreground">
        Couldn&apos;t check the ledger against the PT sheet: {e instanceof DriveNotConnected ? e.message : e instanceof Error ? e.message : String(e)}
      </Card>
    );
  }
  const { rows, problem } = sheetQuantities(sheet.tabs);
  const checks = compareWithLedger(rows, positions);
  const issues = checks.filter((c) => c.status === "mismatch" || c.status === "sheet_only" || c.status === "ledger_only");
  const fractional = checks.filter((c) => c.status === "fractional").length;
  const gid = sheet.tabs.find((t) => t.name === POSITIONS_TAB)?.gid;
  const tabUrl = gid !== undefined ? `https://docs.google.com/spreadsheets/d/${sheet.fileId}/edit#gid=${gid}` : sheet.url;

  return (
    <section className="mb-6">
      <SectionTitle aside={`sheet edited ${fmtDateTime(sheet.modifiedTime)}${sheet.lastModifiedBy ? ` by ${sheet.lastModifiedBy}` : ""}`}>
        Check against the PT sheet
      </SectionTitle>
      <Card className="p-4 text-sm">
        {problem ? (
          <p className="text-destructive">{problem}</p>
        ) : issues.length === 0 ? (
          <p>
            All {checks.length} holdings match the share counts in the sheet&apos;s{" "}
            <a href={tabUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              {POSITIONS_TAB}
            </a>{" "}
            tab, counting recorded trades only (the ledger&apos;s reinvested dividends aren&apos;t in the sheet).{fractional ? ` ${fractional} differ by under a share.` : ""}
          </p>
        ) : (
          <>
            <p className="mb-3">
              {issues.length === 1 ? "1 holding differs" : `${issues.length} holdings differ`} from the sheet&apos;s{" "}
              <a href={tabUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                {POSITIONS_TAB}
              </a>{" "}
              tab by a whole share or more, counting recorded trades only (the ledger&apos;s reinvested dividends aren&apos;t in the sheet). Check the trade tickets before recording anything.
              {fractional ? ` ${fractional} more differ by under a share.` : ""}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Sheet</TableHead>
                  <TableHead className="text-right">Ledger</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Likely cause</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((c) => (
                  <TableRow key={c.ticker}>
                    <TableCell className="font-medium">{c.ticker}</TableCell>
                    <TableCell className="tnum text-right">
                      {shares(c.sheet)}
                      {c.ref && <span className="ml-1 text-xs text-muted-foreground">({c.ref})</span>}
                    </TableCell>
                    <TableCell className="tnum text-right">{shares(c.ledger)}</TableCell>
                    <TableCell className="tnum text-right">{c.diff > 0 ? `+${shares(c.diff)}` : shares(c.diff)}</TableCell>
                    <TableCell className="text-muted-foreground">{meaning(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Card>
    </section>
  );
}
