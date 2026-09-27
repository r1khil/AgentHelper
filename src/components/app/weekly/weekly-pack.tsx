"use client";

import { useState } from "react";
import { Mail, Send, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/app/page-header";
import { CopyButton } from "./copy-button";
import { buildWeeklyNow, fillWeeklyFromSheet, markWeeklySent, reopenWeekly, saveWeeklyField, saveWeeklyFigures, sendWeeklyEmailNow } from "@/lib/actions/weekly";
import { agendaLine, fmtAumK, fmtDeckPct, itemsToLines, packText, performerLine } from "@/lib/weekly/format";
import { carriedFigureKeys, deriveRelative, parseFigureInput } from "@/lib/weekly/figures";
import { AGENDA_LABELS, AGENDA_SECTIONS, type AgendaItem, type SourceEntry, type WeeklyAgenda, type WeeklyFigures, type WeeklyPerformers, type WeeklySources } from "@/lib/weekly/types";
import { packTitle, weekRangeLabel } from "@/lib/weekly/weeks";
import { fmtDateTime } from "@/lib/format";

/** The Sunday email as it would go out now, and what happened to it. */
export type EmailView = {
  to: string | null;
  cc: string[];
  /** Test accounts on the list, which are never emailed. */
  skipped: string[];
  subject: string;
  text: string;
  record: SourceEntry | null;
};

export type WeeklyPackProps = {
  weekEnding: string;
  agendaRange: { from: string; to: string };
  status: "draft" | "sent";
  figures: WeeklyFigures;
  performers: WeeklyPerformers | null;
  agenda: WeeklyAgenda;
  lastWeekAgenda: WeeklyAgenda;
  sources: WeeklySources;
  email: EmailView | null;
  builtAt: string | null;
  editedAt: string | null;
  sentAt: string | null;
};

function Notice({ tone, children }: { tone: "ok" | "warn" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-up/30 bg-up/5"
      : tone === "warn"
        ? "border-destructive/30 bg-destructive/5 text-destructive"
        : "bg-muted/40 text-muted-foreground";
  return <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

function Line({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-t py-1.5 first:border-t-0">
      <span className="min-w-0 text-sm break-words">{text}</span>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

function PerformerList({ title, list, section }: { title: string; list: { ticker: string; name: string; pct: number }[]; section: string }) {
  const lines = list.map(performerLine);
  return (
    <Card className="p-4">
      <SectionTitle aside={lines.length ? <CopyButton text={`${section}\n${lines.join("\n")}`} label="Copy section" /> : "no closes yet"}>{title}</SectionTitle>
      {lines.length ? lines.map((l) => <Line key={l} text={l} />) : <p className="text-sm text-muted-foreground">Nothing to rank yet. Friday&apos;s closes arrive with the price history job.</p>}
    </Card>
  );
}

export function WeeklyPack(props: WeeklyPackProps) {
  const sent = props.status === "sent";
  const [aumK, setAumK] = useState(props.figures.aumK.value === null ? "" : String(props.figures.aumK.value));
  const [ytdPct, setYtdPct] = useState(props.figures.ytdPct.value === null ? "" : String(props.figures.ytdPct.value));
  const [benchmarkYtdPct, setBenchmarkYtdPct] = useState(props.figures.benchmarkYtdPct.value === null ? "" : String(props.figures.benchmarkYtdPct.value));

  const num = (raw: string) => {
    const v = parseFigureInput(raw);
    return v === undefined ? null : v;
  };
  const relative = deriveRelative(num(ytdPct), num(benchmarkYtdPct));
  const carried = carriedFigureKeys(props.figures);
  const sheetAsOf = [props.figures.aumK, props.figures.ytdPct, props.figures.benchmarkYtdPct].find((f) => f.source === "sheet")?.asOf;
  const figureNote = (f: WeeklyFigures[keyof WeeklyFigures]) =>
    f.source === "sheet" ? `From the PT sheet${f.ref ? `, cell ${f.ref}` : ""}` : f.source === "carried" ? "Carried from last week" : f.value === null ? "" : "Typed by an exec";
  const highlights = [`AUM: ${fmtAumK(num(aumK))}`, `YTD Return: ${fmtDeckPct(num(ytdPct))}`, `YTD Relative Return (vs SPXTR): ${fmtDeckPct(relative)}`];

  const whole = packText({
    weekEnding: props.weekEnding,
    figures: {
      aumK: { value: num(aumK), source: props.figures.aumK.source },
      ytdPct: { value: num(ytdPct), source: props.figures.ytdPct.source },
      benchmarkYtdPct: { value: num(benchmarkYtdPct), source: props.figures.benchmarkYtdPct.source },
    },
    performers: props.performers,
    agenda: props.agenda,
    lastWeekAgenda: props.lastWeekAgenda,
  });

  // The email's own record shows on its card.
  const failedSteps = Object.entries(props.sources).filter(([step, v]) => v.status === "failed" && step !== "email");
  const missing = props.performers?.missing ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{packTitle(props.weekEnding)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agenda covers {weekRangeLabel(props.agendaRange.from, props.agendaRange.to)}.
            {props.builtAt ? ` Built ${fmtDateTime(props.builtAt)}.` : " Not built yet."}
            {props.editedAt ? ` Edited ${fmtDateTime(props.editedAt)}.` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant={sent ? "secondary" : "outline"}>{sent ? `Sent${props.sentAt ? ` ${fmtDateTime(props.sentAt)}` : ""}` : "Draft"}</Badge>
          <CopyButton text={whole} label="Copy whole pack" variant="outline" />
          <form action={buildWeeklyNow}>
            <input type="hidden" name="week" value={props.weekEnding} />
            <Button type="submit" size="sm" variant="outline">Rebuild</Button>
          </form>
          <form action={sent ? reopenWeekly : markWeeklySent}>
            <input type="hidden" name="week" value={props.weekEnding} />
            <Button type="submit" size="sm" variant={sent ? "outline" : "default"}>
              {sent ? <Undo2 data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              {sent ? "Reopen" : "Mark sent"}
            </Button>
          </form>
        </div>
      </div>

      {sent && <Notice tone="info">This pack is marked sent. The Sunday job leaves it alone; reopen it to make changes.</Notice>}
      {carried.length > 0 && <Notice tone="info">{carried.join(", ")} {carried.length === 1 ? "is" : "are"} carried from last week. Check the numbers and save to confirm them.</Notice>}
      {missing.length > 0 && <Notice tone="info">No Monday and Friday closes for {missing.join(", ")}; they are left out of the rankings.</Notice>}
      {props.performers?.checks?.map((c) => (
        <Notice key={c} tone="info">
          {c}
        </Notice>
      ))}
      {failedSteps.length > 0 && (
        <Notice tone="warn">
          Could not build: {failedSteps.map(([step, v]) => `${step} (${v.error ?? "unknown error"})`).join("; ")}. Everything else on this page is current.
        </Notice>
      )}

      {props.email && <EmailCard week={props.weekEnding} email={props.email} />}

      <Card className="p-4">
        <SectionTitle aside={<CopyButton text={`Portfolio Highlights\n${highlights.join("\n")}`} label="Copy section" />}>Portfolio Highlights</SectionTitle>
        <form action={saveWeeklyFigures} className="grid gap-3">
          <input type="hidden" name="week" value={props.weekEnding} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="aumK">AUM ($k)</Label>
              <Input id="aumK" name="aumK" value={aumK} onChange={(e) => setAumK(e.target.value)} placeholder="4646.9" inputMode="decimal" disabled={sent} />
              <span className="text-xs text-muted-foreground">{figureNote(props.figures.aumK)}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ytdPct">YTD return (%)</Label>
              <Input id="ytdPct" name="ytdPct" value={ytdPct} onChange={(e) => setYtdPct(e.target.value)} placeholder="6.8" inputMode="decimal" disabled={sent} />
              <span className="text-xs text-muted-foreground">{figureNote(props.figures.ytdPct)}</span>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="benchmarkYtdPct">SPXTR YTD (%)</Label>
              <Input id="benchmarkYtdPct" name="benchmarkYtdPct" value={benchmarkYtdPct} onChange={(e) => setBenchmarkYtdPct(e.target.value)} placeholder="12.5" inputMode="decimal" disabled={sent} />
              <span className="text-xs text-muted-foreground">{figureNote(props.figures.benchmarkYtdPct)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The app reads these from the price target sheet&apos;s 2025 Time-Weighted Returns tab when it builds the pack
            {sheetAsOf ? ` (sheet last edited ${fmtDateTime(sheetAsOf)})` : ""}; the benchmark is the cell the sheet labels &ldquo;SPX YTD Performance&rdquo;. Anything you type and save wins over the sheet. Relative return is YTD less the benchmark.
          </p>
          {!sent && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" variant="outline">Save highlights</Button>
              <Button type="submit" size="sm" variant="ghost" formAction={fillWeeklyFromSheet}>
                Refresh from PT sheet
              </Button>
            </div>
          )}
        </form>
        <div className="mt-3 border-t pt-2">
          {highlights.map((l) => (
            <Line key={l} text={l} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <PerformerList title="Top 3 Performers" list={props.performers?.top ?? []} section="Top 3 Performers" />
        <PerformerList title="Worst 3 Performers" list={props.performers?.worst ?? []} section="Worst 3 Performers" />
      </div>

      {props.performers?.why?.length ? (
        <Card className="p-4">
          <SectionTitle aside="Hoot's read of the news, not for the slide">Why they moved</SectionTitle>
          <ul className="grid gap-1.5 text-sm">
            {props.performers.why.map((w) => (
              <li key={w.ticker}>
                <span className="font-medium">{w.ticker}</span>: {w.text}{" "}
                <a className="text-muted-foreground underline" href={w.url} target="_blank" rel="noreferrer" title={w.headline}>
                  {w.source}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <SectionTitle aside={<CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])).join("\n")} label="Copy section" />}>
          Last Week&apos;s Agenda
        </SectionTitle>
        <p className="mb-2 text-xs text-muted-foreground">A snapshot of the previous pack&apos;s agenda. Rebuilding refreshes it; you cannot edit it here.</p>
        {AGENDA_SECTIONS.map((s) => (
          <Line key={s} text={agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])} />
        ))}
      </Card>

      <Card className="p-4">
        <SectionTitle aside={<CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.agenda[s])).join("\n")} label="Copy section" />}>
          This Week&apos;s Agenda
        </SectionTitle>
        <div className="grid gap-4">
          {AGENDA_SECTIONS.map((section) => (
            <AgendaEditor key={section} week={props.weekEnding} section={section} items={props.agenda[section]} disabled={sent} />
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>YTD Performance chart</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Still pasted by hand from the price target sheet (OF vs SPXTR, SVX, SGX). The daily history behind it isn&apos;t in the sheet tabs the app reads, so this chart stays manual.
        </p>
      </Card>

    </div>
  );
}

function emailStatus(email: EmailView): { text: string; tone: "ok" | "warn" | "info" } {
  const r = email.record;
  if (r?.status === "ok") return { text: `Sent ${fmtDateTime(r.at)} ${r.detail ?? ""}`.trim(), tone: "ok" };
  if (r?.status === "failed") return { text: `Last send failed ${fmtDateTime(r.at)}: ${r.error ?? "unknown error"}`, tone: "warn" };
  if (!email.to) return { text: `Paused: only test accounts are on the list (${email.skipped.join(", ")}). Change it on the Admin page.`, tone: "info" };
  return { text: "Not sent yet. It goes out with the Sunday build.", tone: "info" };
}

function EmailCard({ week, email }: { week: string; email: EmailView }) {
  const status = emailStatus(email);
  const sentBefore = email.record?.status === "ok";
  return (
    <Card className="p-4">
      <SectionTitle aside={<CopyButton text={email.text} label="Copy email" />}>Sunday email</SectionTitle>
      <p className="text-sm text-muted-foreground">
        Hoot emails this pack, every data point in the deck&apos;s order, so the deck can be put together by pasting.{" "}
        {email.to ? (
          <>
            To {email.to}
            {email.cc.length ? `, CC ${email.cc.join(", ")}` : ""}.
          </>
        ) : null}
      </p>
      <div className={`mt-2 text-sm ${status.tone === "warn" ? "text-destructive" : status.tone === "ok" ? "" : "text-muted-foreground"}`}>{status.text}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={sendWeeklyEmailNow}>
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="mode" value="list" />
          <Button type="submit" size="sm" variant={sentBefore ? "outline" : "default"} disabled={!email.to}>
            <Send data-icon="inline-start" />
            {sentBefore ? "Send again" : "Send now"}
          </Button>
        </form>
        <form action={sendWeeklyEmailNow}>
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="mode" value="me" />
          <Button type="submit" size="sm" variant="ghost">
            <Mail data-icon="inline-start" />
            Send a copy to me
          </Button>
        </form>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm">Preview: {email.subject}</summary>
        <pre className="mt-2 max-h-[32rem] overflow-auto rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">{email.text}</pre>
      </details>
    </Card>
  );
}

function AgendaEditor({ week, section, items, disabled }: { week: string; section: (typeof AGENDA_SECTIONS)[number]; items: AgendaItem[]; disabled: boolean }) {
  const [text, setText] = useState(itemsToLines(items));
  const line = agendaLine(AGENDA_LABELS[section], items);
  return (
    <form action={saveWeeklyField} className="grid gap-1.5">
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="section" value={section} />
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`agenda-${section}`}>{AGENDA_LABELS[section]}</Label>
        <CopyButton text={line} label="Copy line" />
      </div>
      <Textarea
        id={`agenda-${section}`}
        name="text"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder={section === "processUpdates" ? "Monday: Stock pitch dry run" : "Monday: ANAB"}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">One item per line, as &ldquo;Day: text&rdquo;. Renders as: {line}</p>
      {!disabled && (
        <div>
          <Button type="submit" size="sm" variant="outline">Save {AGENDA_LABELS[section]}</Button>
        </div>
      )}
    </form>
  );
}
