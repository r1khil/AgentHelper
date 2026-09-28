"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { applyLedgerImport, previewLedgerImport, type ImportPreview } from "@/lib/actions/ledger";
import { IMPORT_TEMPLATE } from "@/lib/attribution/csv";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmtDate, fmtNumber, fmtUsd } from "@/lib/format";

type Ready = Extract<ImportPreview, { ok: true }>;

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<Ready | null>(null);
  const [checking, startCheck] = useTransition();
  const [importing, startImport] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText(""); setFileName(""); setPreview(null); setReplace(false);
    if (input.current) input.current.value = "";
  };

  const runPreview = (csv: string, replaceOpening: boolean | null) =>
    startCheck(async () => {
      // First pass decides the default: a file that starts before the ledger replaces the opening snapshot.
      let r = await previewLedgerImport(csv, replaceOpening ?? false);
      if (r.ok && replaceOpening === null && r.predatesInception && r.openingEntries > 0) {
        setReplace(true);
        r = await previewLedgerImport(csv, true);
      }
      if (!r.ok) { toast.error(r.error); setPreview(null); return; }
      setPreview(r);
    });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const csv = await file.text();
    setFileName(file.name); setText(csv); setReplace(false);
    runPreview(csv, null);
  };

  const blocked = !preview || preview.errors.length > 0 || preview.trades + preview.cashFlows === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload />
        Import CSV
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import ledger history</DialogTitle>
          <DialogDescription>
            One row per trade or cash movement. Columns: <code>date, type, ticker, shares, price, amount, fees, note</code>. Types:{" "}
            <code>opening</code> (a position already held on that date; leave price blank to use the close), <code>buy</code>, <code>sell</code>,{" "}
            <code>deposit</code>, <code>withdrawal</code>, <code>fee</code>, <code>interest</code>. Do not include dividends or splits.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium" aria-label="CSV file" />
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`} download="owl-fund-ledger-template.csv" className="text-sm underline underline-offset-2">Download template</a>
        </div>

        {checking && <p className="text-sm text-muted-foreground">Checking {fileName}…</p>}

        {preview && !checking && (
          <div className="grid gap-4 text-sm">
            <div className="rounded-lg border p-3">
              <div className="font-medium">
                {preview.trades} trades and {preview.cashFlows} cash entries
                {preview.from && ` · ${fmtDate(preview.from)} to ${fmtDate(preview.to)}`}
              </div>
              <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                {preview.duplicates > 0 && <li>{preview.duplicates} rows are already in the ledger and will be skipped.</li>}
                {preview.newTickers.length > 0 && <li>New tickers: {preview.newTickers.join(", ")}. Sector and team are set automatically where possible.</li>}
                {preview.errors.length === 0 && preview.trades + preview.cashFlows > 0 && (
                  <li>
                    After import: {preview.positionsAfter} positions{preview.cashAfter !== null && `, cash ${fmtUsd(preview.cashAfter)}`}.
                  </li>
                )}
              </ul>
            </div>

            {preview.openingEntries > 0 && (
              <label className="flex items-start gap-2 rounded-lg border p-3">
                <input type="checkbox" className="mt-0.5 size-4" checked={replace} onChange={(e) => { setReplace(e.target.checked); runPreview(text, e.target.checked); }} />
                <span>
                  <span className="font-medium">Replace the current opening snapshot</span>
                  <span className="block text-muted-foreground">
                    {preview.predatesInception
                      ? "This file starts before the ledger does. Keeping the snapshot as well would count those positions twice, so it is voided and the file becomes the full history."
                      : "Leave this off when the file only adds trades made after the ledger opened."}
                  </span>
                </span>
              </label>
            )}

            {preview.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <div className="font-medium">{preview.errors.length + preview.moreErrors} problems to fix in the file</div>
                <ul className="mt-1 grid max-h-40 gap-0.5 overflow-y-auto text-muted-foreground">
                  {preview.errors.map((e, i) => <li key={i}>{e.line > 0 && <span className="tnum font-medium text-foreground">Line {e.line}: </span>}{e.message}</li>)}
                  {preview.moreErrors > 0 && <li>…and {preview.moreErrors} more.</li>}
                </ul>
              </div>
            )}

            {preview.errors.length === 0 && preview.positionChanges.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Share counts that change</div>
                <p className="mb-2 text-muted-foreground">Compare the “After import” column with the latest brokerage statement. Small fractions come from reinvested dividends, which are added once prices load.</p>
                <PositionChanges rows={preview.positionChanges} afterLabel="After import" />
              </div>
            )}
            {preview.errors.length === 0 && preview.positionChanges.length === 0 && preview.trades > 0 && (
              <p className="text-muted-foreground">Share counts end up the same as the ledger has today.</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={blocked || checking || importing}
            onClick={() =>
              startImport(async () => {
                const r = await applyLedgerImport(text, replace);
                if (r.ok) { toast.success(r.message ?? "Imported"); setOpen(false); reset(); }
                else toast.error(r.error);
              })
            }
          >
            {importing ? "Importing and loading prices…" : "Import"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PositionChanges({ rows, afterLabel }: { rows: Ready["positionChanges"]; afterLabel: string }) {
  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr><th scope="col" className="px-3 py-1.5 text-left font-medium">Ticker</th><th scope="col" className="px-3 py-1.5 text-right font-medium">Now</th><th scope="col" className="px-3 py-1.5 text-right font-medium">{afterLabel}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="border-t">
              <td className="px-3 py-1 font-medium">{r.ticker}</td>
              <td className="tnum px-3 py-1 text-right">{fmtNumber(r.now)}</td>
              <td className="tnum px-3 py-1 text-right">{fmtNumber(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
