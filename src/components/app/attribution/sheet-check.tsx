import { DriveNotConnected } from "@/lib/drive/auth";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { compareWithLedger, POSITIONS_TAB, sheetQuantities, type QuantityCheck } from "@/lib/pt-sheet/reconcile";
import { ptSheetConfigured, readPtSheet } from "@/lib/pt-sheet/read";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel, PanelHeader, Pill } from "@/components/app/panel";


function meaning(c: QuantityCheck): string {
  if (c.status === "sheet_only") return "In the sheet but not the ledger: a buy may be missing from the ledger.";
  if (c.status === "ledger_only") return "In the ledger but not the sheet: a sale may be missing from the ledger, or the sheet dropped it.";
  const n = fmtNumber(Math.abs(c.diff));
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
      <Panel>
        <PanelHeader title="Check against the PT sheet">
          <Pill tone="caution">Unavailable</Pill>
        </PanelHeader>
        <p className="px-4 py-3 text-[13px] text-muted-foreground">
          Couldn&apos;t check the ledger against the PT sheet: {e instanceof DriveNotConnected ? e.message : e instanceof Error ? e.message : String(e)}
        </p>
      </Panel>
    );
  }
  const { rows, problem } = sheetQuantities(sheet.tabs);
  const checks = compareWithLedger(rows, positions);
  const issues = checks.filter((c) => c.status === "mismatch" || c.status === "sheet_only" || c.status === "ledger_only");
  const fractional = checks.filter((c) => c.status === "fractional").length;
  const gid = sheet.tabs.find((t) => t.name === POSITIONS_TAB)?.gid;
  const tabUrl = gid !== undefined ? `https://docs.google.com/spreadsheets/d/${sheet.fileId}/edit#gid=${gid}` : sheet.url;

  return (
    <Panel>
      <PanelHeader
        title="Check against the PT sheet"
        aside={`Sheet edited ${fmtDateTime(sheet.modifiedTime)}${sheet.lastModifiedBy ? ` by ${sheet.lastModifiedBy}` : ""}`}
      >
        {problem ? <Pill tone="caution">Can&apos;t read</Pill> : issues.length === 0 ? <Pill tone="good">Matches</Pill> : <Pill tone="caution">{issues.length === 1 ? "1 differs" : `${issues.length} differ`}</Pill>}
      </PanelHeader>
      <div className="text-[13px] leading-relaxed">
        {problem ? (
          <p className="px-4 py-3 text-destructive">{problem}</p>
        ) : issues.length === 0 ? (
          <p className="px-4 py-3 text-ink-2">
            All {checks.length} holdings match the share counts in the sheet&apos;s{" "}
            <a href={tabUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              {POSITIONS_TAB}
            </a>{" "}
            tab, counting recorded trades only (the ledger&apos;s reinvested dividends aren&apos;t in the sheet).{fractional ? ` ${fractional} differ by under a share.` : ""}
          </p>
        ) : (
          <>
            <p className="px-4 py-3 text-ink-2">
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
                  <TableHead className="pl-4">Ticker</TableHead>
                  <TableHead className="text-right">Sheet</TableHead>
                  <TableHead className="text-right">Ledger</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="pr-4">Likely cause</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((c) => (
                  <TableRow key={c.ticker}>
                    <TableCell className="pl-4 font-mono font-semibold">{c.ticker}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">
                      {fmtNumber(c.sheet)}
                      {c.ref && <span className="ml-1 text-xs text-muted-foreground">({c.ref})</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{fmtNumber(c.ledger)}</TableCell>
                    <TableCell className="text-right font-mono text-[12.5px]">{fmtNumber(c.diff)}</TableCell>
                    <TableCell className="pr-4 whitespace-normal text-muted-foreground">{meaning(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </Panel>
  );
}
