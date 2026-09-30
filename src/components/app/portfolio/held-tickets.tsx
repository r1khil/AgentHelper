"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordTrade } from "@/lib/actions/ledger";
import { rejectTicket } from "@/lib/actions/tickets";
import type { HeldTicket } from "@/lib/attribution/held-tickets";
import { fmtChangeMoney, fmtDateTime, fmtDay, fmtMoney, fmtNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { Delta } from "./figures";

/** The gap sentence without its closing instruction: the page says that part itself. */
const gapOf = (why: string) => why.replace(/\s*Check it is the price.*$/, "");

/**
 * "To review": tickets execs emailed to Hoot that he held back because the price is far from the market's. Nothing
 * reaches the ledger until someone confirms the price against the broker confirmation and records it (or edits the
 * trade first). Rejecting takes it off the list; the emailed ticket stays in the email log.
 */
export function HeldTickets({ tickets, today, positions }: { tickets: HeldTicket[]; today: string; positions: { ticker: string; shares: number }[] }) {
  return (
    <section aria-labelledby="review-h" className="flex flex-col">
      <h2 id="review-h" className="text-title font-bold tracking-[-0.01em]">
        To review <span className="text-down">{tickets.length}</span>
      </h2>
      <p className="mt-0.5 text-caption text-muted-foreground">Tickets emailed to Hoot by execs, held back for a check. Nothing reaches the ledger until someone records it.</p>
      <div className="mt-2.5 border-t border-foreground">
        {tickets.map((t) => (
          <Held key={t.id} t={t} today={today} positions={positions} />
        ))}
      </div>
    </section>
  );
}

function Held({ t, today, positions }: { t: HeldTicket; today: string; positions: { ticker: string; shares: number }[] }) {
  const why = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const value = t.shares * t.price;
  const signed = t.side === "buy" ? -value : value;
  const amount = t.side === "buy" ? fmtMoney(signed) : fmtChangeMoney(signed);
  const defaults = { ticker: t.ticker, side: t.side, tradeDate: t.date, shares: t.shares, price: t.price, note: "Trade ticket, emailed. Price checked against the broker confirmation" };

  const record = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("tradeDate", t.date);
      fd.set("side", t.side);
      fd.set("ticker", t.ticker);
      fd.set("shares", String(t.shares));
      fd.set("price", String(t.price));
      fd.set("note", defaults.note);
      const r = await recordTrade(null, fd);
      if (r.ok) toast.success(r.message ?? "Recorded");
      else toast.error(r.error);
    });
  const reject = () =>
    start(async () => {
      const r = await rejectTicket(t.id);
      if (r.ok) toast.success(r.message ?? "Rejected");
      else toast.error(r.error);
    });

  const fields: { k: string; v: string; caution?: boolean }[] = [
    { k: "Symbol", v: t.name ? `${t.ticker}, ${t.name}` : t.ticker },
    { k: "Shares", v: fmtNumber(t.shares) },
    { k: "Price on ticket", v: fmtMoney(t.price), caution: true },
    { k: "Trade date", v: fmtDay(t.date) },
    { k: "Team", v: t.team ?? "Not assigned yet" },
    { k: "Emailed by", v: t.from },
    { k: "Read from", v: t.file },
    { k: "Received", v: fmtDateTime(t.receivedAt) },
  ];

  return (
    <div className="border-b">
      <div className="grid grid-cols-[36px_minmax(0,1fr)_140px_150px] items-center gap-3.5 pt-3.5 pb-2.5">
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-foreground text-caption font-bold text-background">
          {t.side === "buy" ? "B" : "S"}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-emph font-semibold">
            {t.side === "buy" ? "Buy" : "Sell"} {fmtNumber(t.shares)} {t.ticker} at {fmtMoney(t.price)}
          </span>
          <span className="truncate text-caption text-muted-foreground">Emailed ticket, sent by {t.from}, DKIM verified, {fmtDateTime(t.receivedAt)}</span>
        </span>
        <span className="text-right text-emph font-semibold">
          <Delta text={amount} />
        </span>
        <span className="pr-8 text-right text-caption font-semibold text-caution-foreground">Held for a check</span>
      </div>
      <div className="ml-[50px] pb-[18px]">
        <p id={why} className="text-body">
          <b className="font-semibold">Check the price.</b> {gapOf(t.why)} Tickets more than 5% from the market are held until someone confirms the price against the broker confirmation.
        </p>
        <dl className="mt-3 grid grid-cols-4 gap-3">
          {fields.map((f) => (
            <div key={f.k} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-caption text-muted-foreground">{f.k}</dt>
              <dd className={f.caution ? "truncate text-body font-semibold text-caution-foreground" : "truncate text-body font-semibold"}>{f.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 text-body">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-[15px] accent-foreground" />
            I checked the price against the broker confirmation
          </label>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button variant="destructive" disabled={pending} onClick={reject}>
            Reject
          </Button>
          <Button disabled={!confirmed || pending} aria-describedby={why} onClick={record}>
            {pending ? "Recording…" : "Record to ledger"}
          </Button>
        </div>
      </div>
      <TradeDialog today={today} positions={positions} trigger={false} open={editing} onOpenChange={setEditing} defaults={defaults} onRecorded={() => void rejectTicket(t.id)} title="Edit and record this ticket" description="Change anything the broker confirmation says differently, then record it. It goes into the ledger as executed." />
    </div>
  );
}
