"use client";

import { useRef, useState, useTransition } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { applyTradeTickets, previewTradeTickets, type TicketPreview } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fmtDate, fmtMoney } from "@/lib/format";
import { PositionChanges } from "./import-dialog";

type Ready = Extract<TicketPreview, { ok: true }>;
// Server Actions take bodies up to 1MB.
const MAX_TOTAL_BYTES = 900_000;

/** `emailTo` is Hoot's address; execs can also email or forward tickets there and Hoot records them. */
export function TicketDialog({ emailTo }: { emailTo?: string }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Ready | null>(null);
  const [checking, startCheck] = useTransition();
  const [recording, startRecord] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFiles([]); setPreview(null);
    if (input.current) input.current.value = "";
  };

  const form = (list: File[]) => {
    const fd = new FormData();
    for (const f of list) fd.append("files", f);
    return fd;
  };

  const onFiles = (list: FileList | null) => {
    const picked = [...(list ?? [])];
    if (!picked.length) return;
    if (picked.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) {
      toast.error("Those files are too large together. Upload fewer tickets at a time.");
      return;
    }
    setFiles(picked);
    startCheck(async () => {
      const r = await previewTradeTickets(form(picked));
      if (!r.ok) { toast.error(r.error); setPreview(null); return; }
      setPreview(r);
    });
  };

  const unreadable = preview?.tickets.filter((t) => !t.ticket) ?? [];
  const ledger = preview?.ledger?.ok ? preview.ledger : null;
  const toRecord = ledger?.trades ?? 0;
  const skipped = preview?.tickets.filter((t) => t.skip).length ?? 0;
  const blocked = !preview || unreadable.length > 0 || !ledger || ledger.errors.length > 0 || toRecord === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <FileText />
        Upload tickets
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Record trades from tickets</DialogTitle>
          <DialogDescription>
            Upload the Word trade tickets for trades that have been executed. Each ticket becomes one buy or sell at the ticket&apos;s date,
            price and share count. Check the prices against the fills before recording; fees are not on tickets.
            {emailTo && (
              <>
                {" "}
                You can also email or forward tickets to Hoot at <span className="font-medium text-foreground">{emailTo}</span>. Hoot records
                them and replies with what was added.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={input}
          type="file"
          multiple
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => onFiles(e.target.files)}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm file:font-medium"
          aria-label="Trade tickets"
        />

        {checking && <p className="text-sm text-muted-foreground">Reading {files.length} ticket{files.length === 1 ? "" : "s"}…</p>}

        {preview && !checking && (
          <div className="grid gap-4 text-sm">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">Ticket</th>
                    <th className="px-3 py-1.5 text-left font-medium">Date</th>
                    <th className="px-3 py-1.5 text-left font-medium">Side</th>
                    <th className="px-3 py-1.5 text-right font-medium">Shares</th>
                    <th className="px-3 py-1.5 text-right font-medium">Price</th>
                    <th className="px-3 py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.tickets.map((r, i) => (
                    <tr key={i} className={`border-t align-top ${r.skip ? "text-muted-foreground" : ""}`}>
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{r.ticket ? r.ticket.ticker : r.file}</div>
                        {r.ticket && <div className="max-w-64 truncate text-xs text-muted-foreground">{r.ticket.name}</div>}
                        {r.errors.map((m, j) => <div key={`e${j}`} className="mt-0.5 max-w-sm text-xs text-destructive">{m}</div>)}
                        {r.skip && <div className="mt-0.5 max-w-sm text-xs text-muted-foreground">Skipped. {r.skip}</div>}
                        {r.warnings.map((m, j) => <div key={`w${j}`} className="mt-0.5 max-w-sm text-xs text-amber-700 dark:text-amber-400">{m}</div>)}
                      </td>
                      {r.ticket ? (
                        <>
                          <td className="tnum whitespace-nowrap px-3 py-1.5">{fmtDate(r.ticket.date)}</td>
                          <td className="px-3 py-1.5">{r.ticket.side === "buy" ? "Buy" : "Sell"}</td>
                          <td className="tnum px-3 py-1.5 text-right">{r.ticket.shares.toLocaleString("en-US")}</td>
                          <td className="tnum px-3 py-1.5 text-right">{fmtMoney(r.ticket.price)}</td>
                          <td className="tnum px-3 py-1.5 text-right">{fmtMoney(r.ticket.shares * r.ticket.price)}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3 py-1.5 text-muted-foreground">Not recorded</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {unreadable.length > 0 && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                {unreadable.length} file{unreadable.length === 1 ? "" : "s"} could not be read. Remove {unreadable.length === 1 ? "it" : "them"} from the upload or fix the ticket, then choose the files again.
              </p>
            )}

            {preview.ledger && !preview.ledger.ok && <p className="text-destructive">{preview.ledger.error}</p>}

            {!preview.ledger && unreadable.length === 0 && <p className="text-muted-foreground">Nothing new to record. Every ticket is already in the ledger.</p>}

            {ledger && (
              <div className="rounded-lg border p-3">
                <div className="font-medium">{toRecord} trade{toRecord === 1 ? "" : "s"} to record</div>
                <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                  {ledger.duplicates > 0 && <li>{ledger.duplicates} already in the ledger and will be skipped.</li>}
                  {skipped > 0 && <li>{skipped} skipped above.</li>}
                  {ledger.newTickers.length > 0 && <li>New tickers: {ledger.newTickers.join(", ")}. Sector and team are set automatically where possible.</li>}
                  {ledger.errors.length === 0 && toRecord > 0 && (
                    <li>After recording: {ledger.positionsAfter} positions{ledger.cashAfter !== null && `, cash $${fmtMoney(ledger.cashAfter)}`}.</li>
                  )}
                </ul>
              </div>
            )}

            {ledger && ledger.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <div className="font-medium">{ledger.errors.length + ledger.moreErrors} problem{ledger.errors.length + ledger.moreErrors === 1 ? "" : "s"} to fix</div>
                <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                  {ledger.errors.map((e, i) => <li key={i}>{e.message}</li>)}
                </ul>
              </div>
            )}

            {ledger && ledger.errors.length === 0 && ledger.positionChanges.length > 0 && (
              <div>
                <div className="mb-1 font-medium">Share counts that change</div>
                <PositionChanges rows={ledger.positionChanges} afterLabel="After recording" />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={blocked || checking || recording}
            onClick={() =>
              startRecord(async () => {
                const r = await applyTradeTickets(form(files));
                if (r.ok) { toast.success(r.message ?? "Recorded"); setOpen(false); reset(); }
                else toast.error(r.error);
              })
            }
          >
            {recording ? "Recording and loading prices…" : toRecord ? `Record ${toRecord} trade${toRecord === 1 ? "" : "s"}` : "Record trades"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
