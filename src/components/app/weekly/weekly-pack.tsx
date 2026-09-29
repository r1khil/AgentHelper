"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelFooter, PanelHeader, Pill } from "@/components/app/panel";
import { PageHero } from "@/components/app/page-head";
import { Tabs, tabPanelProps } from "@/components/app/tabs";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { CopyButton } from "./copy-button";
import { SendEmailDialog } from "./send-email-dialog";
import { fillWeeklyFromSheet, saveWeeklyField, saveWeeklyFigures } from "@/lib/actions/weekly";
import { agendaLine, fmtAumK, fmtDeckPct, itemsToLines, performerLine } from "@/lib/weekly/format";
import { carriedFigureKeys, deriveRelative, parseFigureInput } from "@/lib/weekly/figures";
import { AGENDA_LABELS, AGENDA_SECTIONS, type AgendaItem, type Performer, type WeeklyFigures } from "@/lib/weekly/types";
import type { PackStatus } from "@/lib/weekly/status";
import { weekRangeLabel } from "@/lib/weekly/weeks";
import { fmtChangeBp, fmtChangePct, fmtDateTime, fmtDay, fmtDayMonth, ppToBp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OwlMark } from "@/components/app/owl-mark";
import type { EmailView, WeeklyPackProps } from "./types";
import { whenBuilt } from "./when";

export type { EmailView, WeeklyPackProps } from "./types";

const TABS = ["summary", "email", "highlights", "agenda", "checks"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { summary: "Summary", email: "Email", highlights: "Highlights", agenda: "Agenda", checks: "Checks" };

const up = (v: number | null | undefined) => (v === null || v === undefined ? "" : v > 0 ? "text-up" : v < 0 ? "text-down" : "");

/** A change in accounting style, green when up and red when down. */
function Chg({ value, bp, digits = 1 }: { value: number | null | undefined; bp?: boolean; digits?: number }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const text = bp ? fmtChangeBp(value) : fmtChangePct(value, digits);
  return <span className={cn("font-semibold", text.startsWith("(") ? "text-down" : /[1-9]/.test(text) ? "text-up" : "text-muted-foreground")}>{text}</span>;
}

export function WeeklyPack(props: WeeklyPackProps) {
  const sent = props.status === "sent";
  const [tab, setTab] = useState<Tab>("summary");
  const [sendOpen, setSendOpen] = useState(false);
  const [aumK, setAumK] = useState(props.figures.aumK.value === null ? "" : String(props.figures.aumK.value));
  const [ytdPct, setYtdPct] = useState(props.figures.ytdPct.value === null ? "" : String(props.figures.ytdPct.value));
  const [benchmarkYtdPct, setBenchmarkYtdPct] = useState(props.figures.benchmarkYtdPct.value === null ? "" : String(props.figures.benchmarkYtdPct.value));

  const num = (raw: string) => {
    const v = parseFigureInput(raw);
    return v === undefined ? null : v;
  };
  const relative = deriveRelative(num(ytdPct), num(benchmarkYtdPct));
  const highlights = [`AUM: ${fmtAumK(num(aumK))}`, `YTD Return: ${fmtDeckPct(num(ytdPct))}`, `YTD Relative Return (vs SPXTR): ${fmtDeckPct(relative)}`];

  const email = props.email;
  const name = (addr: string) => email?.names[addr.toLowerCase()] ?? addr;
  const agendaCount = props.agenda.earnings.length + props.agenda.marketNews.length + props.agenda.processUpdates.length;

  // The email's own record shows on the Email tab.
  const failedSteps = Object.entries(props.sources).filter(([step, v]) => v.status === "failed" && step !== "email");
  const carried = carriedFigureKeys(props.figures);
  const missing = props.performers?.missing ?? [];
  const checks = props.performers?.checks ?? [];
  const checkCount = checks.length + (missing.length ? 1 : 0) + (carried.length ? 1 : 0) + failedSteps.length;

  const { fund, spx } = props.stats;
  const diffBp = fund !== null && spx !== null ? Math.round((fund - spx) * 10_000) : null;
  const emailedAt = email?.record?.status === "ok" ? email.record.at : null;
  const meta = [
    props.builtAt ? `built ${whenBuilt(props.builtAt)}` : "not built yet",
    emailedAt ? `sent ${fmtDateTime(emailedAt)}` : null,
    props.editedAt ? `edited ${fmtDateTime(props.editedAt)}` : null,
    sent ? "locked" : "open for edits",
  ].filter(Boolean);
  const window = `${fmtDayMonth(props.stats.window.start)} to ${fmtDayMonth(props.stats.window.end)} closes`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {props.builtAt && !sent && <HootMoodFor mood="happy" />}
      <PageHero
        label={`Update for the week ended ${fmtDay(props.weekEnding)} · ${meta.join(" · ")}`}
        value={<span className={up(fund)}>{fund === null ? "—" : fmtChangePct(fund * 100)}</span>}
        note={
          fund === null
            ? "Friday's closes have not arrived yet, so the week's return can't be worked out"
            : `The fund's week · S&P 500 ${spx === null ? "—" : fmtChangePct(spx * 100)}${diffBp === null ? "" : ` · ${fmtChangeBp(diffBp)} against it`} · ${window} in the app's price history`
        }
      />

      {failedSteps.length > 0 && (
        <p className="mt-3 text-body text-caution-foreground">
          <b className="font-semibold">Could not build</b> {failedSteps.map(([step, v]) => `${step} (${v.error ?? "unknown error"})`).join("; ")}. Everything else on this page is current.
        </p>
      )}

      <Tabs
        label="Pack sections"
        idBase="weekly-pack"
        className="mt-5"
        onSelect={(k) => setTab(k as Tab)}
        items={TABS.map((t) => ({
          key: t,
          label: TAB_LABELS[t],
          active: tab === t,
          count: t === "checks" ? (checkCount > 0 ? checkCount : undefined) : t === "agenda" ? agendaCount : undefined,
        }))}
      />

      <div {...tabPanelProps("weekly-pack", tab)} className="flex min-h-0 flex-1 flex-col gap-5 pt-5">
        {tab === "summary" && (
          <>
            <SummaryGrid {...props} highlights={highlights} onPreview={() => setTab("email")} onSend={() => setSendOpen(true)} name={name} />
            {email && <SendEmailDialog open={sendOpen} onOpenChange={setSendOpen} week={props.weekEnding} email={email} mode="list" />}
          </>
        )}
        {tab === "email" && (email ? <EmailPanel week={props.weekEnding} state={props.state} sentAt={props.sentAt} email={email} name={name} /> : <p className="text-body text-muted-foreground">The email can be written once the pack is built.</p>)}
        {tab === "highlights" && (
          <HighlightsPanel
            week={props.weekEnding}
            figures={props.figures}
            sent={sent}
            carried={carried}
            values={{ aumK, ytdPct, benchmarkYtdPct }}
            setters={{ setAumK, setYtdPct, setBenchmarkYtdPct }}
            highlights={highlights}
          />
        )}
        {tab === "agenda" && <AgendaPanels {...props} sent={sent} />}
        {tab === "checks" && <ChecksPanel {...props} checks={checks} missing={missing} carried={carried} />}
      </div>
    </div>
  );
}

function Banner({ tone = "info", children }: { tone?: "info" | "caution"; children: React.ReactNode }) {
  return <p className={cn("shrink-0 text-body", tone === "caution" ? "text-caution-foreground" : "text-ink-2")}>{children}</p>;
}

/* ---------- Summary ---------- */

/** A section of the summary: a 13px bold title, what it is on the right, then its rows. */
/** `hoot` marks a section Hoot wrote with his face, the way anything Hoot found is marked. */
function Section({ title, aside, copy, hoot, children, className }: { title: string; aside?: React.ReactNode; copy?: string; hoot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("min-w-0", className)}>
      <div className="flex items-center gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-body font-bold">
          {hoot && <OwlMark className="size-[18px] rounded-full" />}
          {title}
        </h2>
        {aside && <span className="text-caption text-muted-foreground">{aside}</span>}
        {copy && <CopyIcon text={copy} label={`Copy ${title}`} />}
      </div>
      <div className="mt-1 flex flex-col">{children}</div>
    </section>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-[34px] items-center justify-between gap-3 border-b border-row py-1 text-body", className)}>{children}</div>;
}

function SummaryGrid(props: WeeklyPackProps & { highlights: string[]; onPreview: () => void; onSend: () => void; name: (a: string) => string }) {
  const teamOf = (t: string) => props.teamByTicker[t.toUpperCase()];
  const why = props.performers?.source === "sheet" ? "Ranked from the PT sheet's % 1 Week" : "Ranked from the app's Monday and Friday closes";
  const notes = props.performers?.why ?? [];
  const email = props.email;
  const sentBefore = email?.record?.status === "ok";
  return (
    <>
      <div className="grid grid-cols-2 gap-10 border-t pt-4">
        <PerformerSection title="Top 3 performers" section="Top 3 Performers" list={props.performers?.top ?? []} teamOf={teamOf} why={why} />
        <PerformerSection title="Worst 3 performers" section="Worst 3 Performers" list={props.performers?.worst ?? []} teamOf={teamOf} why={why} />
      </div>

      <Section title="Highlights" aside="Deck figures, from the PT sheet or typed by an exec" copy={`Portfolio Highlights\n${props.highlights.join("\n")}`}>
        {props.highlights.map((l) => (
          <Row key={l}>
            <span>{l}</span>
          </Row>
        ))}
      </Section>

      {notes.length > 0 && (
        // Hoot wrote these from the week's headlines, so each one cites its headline.
        <Section title="Why they moved" hoot aside="Hoot's read of the news, not for the slide">
          {notes.map((w) => (
            <Row key={w.ticker} className="items-baseline">
              <span className="min-w-0 flex-1">
                <b className="mr-3 font-semibold">{w.ticker}</b>
                {w.text}
              </span>
              <a href={w.url} target="_blank" rel="noreferrer" title={w.headline} className="shrink-0 text-caption text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground">
                {w.source}
              </a>
            </Row>
          ))}
        </Section>
      )}

      <div className="grid grid-cols-3 gap-10">
        <Section title="Movements opened" aside={props.stats.movementsOpened === null ? "unavailable" : undefined}>
          {props.stats.movements.length === 0 ? (
            <Row>
              <span className="text-muted-foreground">{props.stats.movementsOpened === null ? "Movements could not be read." : "The close check opened none."}</span>
            </Row>
          ) : (
            props.stats.movements.map((m) => (
              <Row key={`${m.ticker}-${m.sessionDate}`}>
                <span>
                  <b className="font-semibold">{m.ticker}</b> <span className="text-muted-foreground">{fmtDayMonth(m.sessionDate)}</span>
                </span>
                <Chg value={ppToBp(m.relativePp)} bp />
              </Row>
            ))
          )}
        </Section>
        <NextWeek {...props} />
        <Section title="Process updates" copy={agendaLine(AGENDA_LABELS.processUpdates, props.agenda.processUpdates)}>
          {props.agenda.processUpdates.length === 0 ? (
            <Row>
              <span className="text-muted-foreground">Nothing scheduled</span>
            </Row>
          ) : (
            props.agenda.processUpdates.map((it, i) => <AgendaRow key={`${it.text}-${i}`} item={it} />)
          )}
          <span className="mt-1 text-caption text-muted-foreground">From the fund calendar .xlsx</span>
        </Section>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-3 text-body">
        <b className="font-semibold">Sunday email</b>
        {email ? (
          <>
            <span className={cn(emailStatusIsCaution(email, props.state) ? "text-caution-foreground" : "text-ink-2")}>{emailStatus(email, props.state, props.sentAt)}</span>
            <span className="flex-1" />
            <button type="button" onClick={props.onPreview} className="rounded-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Preview
            </button>
            <Button type="button" size="sm" variant="secondary" disabled={!email.to} onClick={props.onSend}>
              {sentBefore ? "Send again…" : "Send…"}
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground">The email can be written once the pack is built.</span>
        )}
      </div>
    </>
  );
}

const SHORT_DAY: Record<string, string> = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };

function AgendaRow({ item, note }: { item: AgendaItem; note?: string }) {
  return (
    <Row>
      <span className="min-w-0">
        {item.text}
        {note && <span className="text-muted-foreground"> · {note}</span>}
      </span>
      <span className="shrink-0 text-caption text-muted-foreground">{item.day ? (SHORT_DAY[item.day] ?? item.day) : ""}</span>
    </Row>
  );
}

/** The coming week: the Fund's and bellwethers' reports, then the economic releases, one line each with its day. */
function NextWeek(props: WeeklyPackProps) {
  const items = [...props.agenda.earnings.map((it) => ({ it, note: props.teamByTicker[it.text.toUpperCase()] ?? props.bellwetherByTicker[it.text.toUpperCase()] })), ...props.agenda.marketNews.map((it) => ({ it, note: undefined }))];
  const holdingReports = props.agenda.earnings.some((it) => props.teamByTicker[it.text.toUpperCase()]);
  return (
    <Section title="Next week" aside={weekRangeLabel(props.agendaRange.from, props.agendaRange.to)} copy={[agendaLine(AGENDA_LABELS.earnings, props.agenda.earnings), agendaLine(AGENDA_LABELS.marketNews, props.agenda.marketNews)].join("\n")}>
      {items.length === 0 ? (
        <Row>
          <span className="text-muted-foreground">Nothing scheduled</span>
        </Row>
      ) : (
        items.map(({ it, note }, i) => <AgendaRow key={`${it.text}-${i}`} item={it} note={note} />)
      )}
      {!holdingReports && items.length > 0 && (
        <Row>
          <span className="text-muted-foreground">No fund holdings report</span>
        </Row>
      )}
    </Section>
  );
}

function PerformerSection({ title, section, list, teamOf, why }: { title: string; section: string; list: Performer[]; teamOf: (t: string) => string | undefined; why: string }) {
  const lines = list.map(performerLine);
  return (
    <Section title={title} aside={<span title={why}>week, price return</span>} copy={lines.length ? `${section}\n${lines.join("\n")}` : undefined}>
      {list.length ? (
        list.map((p) => (
          <Row key={p.ticker}>
            <span className="min-w-0 truncate" title={performerLine(p)}>
              <b className="font-semibold">{p.ticker}</b>
              <span className="text-muted-foreground">
                {" "}
                {p.name}
                {teamOf(p.ticker) ? ` · ${teamOf(p.ticker)}` : ""}
              </span>
            </span>
            <Chg value={p.pct} />
          </Row>
        ))
      ) : (
        <p className="py-2 text-body text-muted-foreground">Nothing to rank yet. Friday&apos;s closes arrive with the price history job.</p>
      )}
    </Section>
  );
}

function CopyIcon({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      <Copy />
    </Button>
  );
}

/* ---------- Email ---------- */

/** What happened to the email, in words, agreeing with the packs list. */
function emailStatus(email: EmailView, state: PackStatus, sentAt: string | null): string {
  const r = email.record;
  const first = (a: string) => email.names[a.toLowerCase()] ?? a;
  const to = email.to ? `to ${first(email.to)}${email.cc.length ? `, ${email.cc.map(first).join(", ")} in CC` : ""}` : "";
  if (r?.status === "ok") return `Sent ${fmtDateTime(r.at)} ${to} · via OpenMail · sending again asks first`.replace(/\s+/g, " ");
  if (state === "sent") return `Marked sent${sentAt ? ` ${fmtDateTime(sentAt)}` : ""}. Hoot has not emailed it to the list.`;
  if (r?.status === "failed") return `Last send failed ${fmtDateTime(r.at)}: ${r.error ?? "unknown error"}`;
  if (!email.to) return `Not sent. The list is paused: only test accounts are on it (${email.skipped.join(", ")}). Change it on the Admin page.`;
  if (state === "scheduled") return `Not sent yet. It goes out ${to} with the Sunday build at 12:00 New York time.`;
  if (r?.status === "held") return `Not sent: ${r.detail ?? "held"}.`;
  return "Not sent. The Sunday run has passed, so it goes out only if you send it.";
}

/** Failed, held, paused and overdue sends are the ones to check. */
function emailStatusIsCaution(email: EmailView, state: PackStatus) {
  return email.record?.status !== "ok" && state !== "sent" && (state === "failed" || state === "draft" || !email.to || email.record?.status === "held");
}

function EmailPanel({ week, state, sentAt, email, name }: { week: string; state: PackStatus; sentAt: string | null; email: EmailView; name: (a: string) => string }) {
  const [dialog, setDialog] = useState<"list" | "me" | null>(null);
  const sentBefore = email.record?.status === "ok";
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-title font-bold tracking-[-0.01em]">Sunday email</h2>
          <CopyButton text={email.text} label="Copy email" variant="outline" />
        </div>
        <p className="max-w-[760px] text-body text-ink-2">
          Hoot emails this pack, every data point in the deck&apos;s order, so the deck can be put together by pasting.
          {email.to ? ` It goes to ${name(email.to)} (${email.to})${email.cc.length ? `, with ${email.cc.map((c) => `${name(c)} (${c})`).join(", ")} in CC` : ""}.` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Pill tone={state === "failed" ? "caution" : state === "sent" ? "good" : "neutral"}>{state === "sent" ? "Sent" : state === "failed" ? "Failed" : state === "scheduled" ? "Scheduled" : "Not sent"}</Pill>
          <span className={cn("text-body", emailStatusIsCaution(email, state) ? "text-caution-foreground" : "text-muted-foreground")}>{emailStatus(email, state, sentAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!email.to} onClick={() => setDialog("list")}>
            {sentBefore ? "Send again…" : "Send…"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDialog("me")}>
            Send a copy to me…
          </Button>
        </div>
        <SendEmailDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} week={week} email={email} mode={dialog ?? "list"} />
      </section>
      <section className="flex min-h-0 flex-1 flex-col border-t pt-3">
        <div className="mb-2 text-caption text-muted-foreground">Preview · {email.subject}</div>
        <pre className="min-h-0 flex-1 overflow-auto bg-band p-3 font-mono text-body leading-relaxed whitespace-pre-wrap">{email.text}</pre>
      </section>
    </div>
  );
}

/* ---------- Highlights ---------- */

function HighlightsPanel({
  week,
  figures,
  sent,
  carried,
  values,
  setters,
  highlights,
}: {
  week: string;
  figures: WeeklyFigures;
  sent: boolean;
  carried: string[];
  values: { aumK: string; ytdPct: string; benchmarkYtdPct: string };
  setters: { setAumK: (v: string) => void; setYtdPct: (v: string) => void; setBenchmarkYtdPct: (v: string) => void };
  highlights: string[];
}) {
  const sheetAsOf = [figures.aumK, figures.ytdPct, figures.benchmarkYtdPct].find((f) => f.source === "sheet")?.asOf;
  const figureNote = (f: WeeklyFigures[keyof WeeklyFigures]) =>
    f.source === "sheet" ? `From the PT sheet${f.ref ? `, cell ${f.ref}` : ""}` : f.source === "carried" ? "Carried from last week" : f.value === null ? "" : "Typed by an exec";
  const fields = [
    { id: "aumK", label: "AUM ($k)", value: values.aumK, set: setters.setAumK, placeholder: "4646.9", fig: figures.aumK },
    { id: "ytdPct", label: "YTD return (%)", value: values.ytdPct, set: setters.setYtdPct, placeholder: "6.8", fig: figures.ytdPct },
    { id: "benchmarkYtdPct", label: "SPXTR YTD (%)", value: values.benchmarkYtdPct, set: setters.setBenchmarkYtdPct, placeholder: "12.5", fig: figures.benchmarkYtdPct },
  ];
  return (
    <div className="grid flex-1 content-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Panel variant="plain">
        <PanelHeader title="Portfolio highlights" aside={sheetAsOf ? `sheet last edited ${fmtDateTime(sheetAsOf)}` : undefined} />
        <form action={saveWeeklyFigures} className="grid gap-3 py-3">
          <input type="hidden" name="week" value={week} />
          {carried.length > 0 && (
            <Banner tone="caution">
              {carried.join(", ")} {carried.length === 1 ? "is" : "are"} carried from last week. Check the numbers and save to confirm them.
            </Banner>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {fields.map((f) => (
              <div key={f.id} className="grid gap-1.5">
                <Label htmlFor={f.id}>{f.label}</Label>
                <Input id={f.id} name={f.id} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} inputMode="decimal" disabled={sent} />
                <span className="text-body text-muted-foreground">{figureNote(f.fig)}</span>
              </div>
            ))}
          </div>
          <p className="text-body leading-relaxed text-muted-foreground">
            The app reads these from the price target sheet&apos;s 2025 Time-Weighted Returns tab when it builds the pack; the benchmark is the cell the sheet labels &ldquo;SPX YTD
            Performance&rdquo;. Anything you type and save wins over the sheet. Relative return is YTD less the benchmark.
          </p>
          {sent ? (
            <Banner>This pack is locked. Reopen it for edits from the header to change these figures.</Banner>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary">Save highlights</Button>
              <Button type="submit" variant="ghost" formAction={fillWeeklyFromSheet}>
                Refresh from PT sheet
              </Button>
            </div>
          )}
        </form>
      </Panel>
      <div className="grid content-start gap-5">
        <Panel variant="plain">
          <PanelHeader title="As it goes in the deck" aside={<CopyButton text={`Portfolio Highlights\n${highlights.join("\n")}`} label="Copy section" />} />
          {highlights.map((l) => (
            <Line key={l} text={l} />
          ))}
        </Panel>
        <Panel variant="plain">
          <PanelHeader title="YTD performance chart" />
          <p className="py-3 text-body text-muted-foreground">
            Still pasted by hand from the price target sheet (OF vs SPXTR, SVX, SGX). The daily history behind it isn&apos;t in the sheet tabs the app reads, so this chart stays manual.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Line({ text }: { text: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 border-b border-row py-1 last:border-b-0">
      <span className="min-w-0 text-body break-words">{text}</span>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

/* ---------- Agenda ---------- */

function AgendaPanels(props: WeeklyPackProps & { sent: boolean }) {
  return (
    <div className="grid flex-1 content-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel variant="plain" className="self-start">
        <PanelHeader title="Last week's agenda" aside={<CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])).join("\n")} label="Copy section" />} />
        <p className="border-b border-row py-2 text-body text-muted-foreground">A snapshot of the previous pack&apos;s agenda. Rebuilding refreshes it; you cannot edit it here.</p>
        {AGENDA_SECTIONS.map((s) => (
          <Line key={s} text={agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])} />
        ))}
      </Panel>
      <Panel variant="plain">
        <PanelHeader
          title="This week's agenda"
          aside={
            <>
              <span>covers {weekRangeLabel(props.agendaRange.from, props.agendaRange.to)}</span>
              <CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.agenda[s])).join("\n")} label="Copy section" />
            </>
          }
        />
        <div className="grid gap-5 py-3">
          {AGENDA_SECTIONS.map((section) => (
            <AgendaEditor key={section} week={props.weekEnding} section={section} items={props.agenda[section]} disabled={props.sent} />
          ))}
        </div>
      </Panel>
    </div>
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
        className="text-body"
      />
      <p className="text-body text-muted-foreground">One item per line, as &ldquo;Day: text&rdquo;. Renders as: {line}</p>
      {!disabled && (
        <div>
          <Button type="submit" size="sm" variant="secondary">
            Save {AGENDA_LABELS[section]}
          </Button>
        </div>
      )}
    </form>
  );
}

/* ---------- Checks ---------- */

const STEP_LABELS: Record<string, string> = {
  carry: "Last week's agenda and figures",
  sheet: "Price target sheet",
  performers: "Best and worst performers",
  earnings: "Next week's earnings",
  marketNews: "Economic releases",
  processUpdates: "Process updates (fund calendar .xlsx)",
  email: "Sunday email",
};

function ChecksPanel(props: WeeklyPackProps & { checks: string[]; missing: string[]; carried: string[] }) {
  const notes = [
    ...props.checks,
    ...(props.missing.length ? [`No Monday and Friday closes for ${props.missing.join(", ")}; they are left out of the rankings.`] : []),
    ...(props.carried.length ? [`${props.carried.join(", ")} ${props.carried.length === 1 ? "is" : "are"} carried from last week. Check the numbers on Highlights and save to confirm them.`] : []),
  ];
  const steps = Object.entries(props.sources).sort(([a], [b]) => Object.keys(STEP_LABELS).indexOf(a) - Object.keys(STEP_LABELS).indexOf(b));
  return (
    <div className="grid flex-1 content-start gap-5 lg:grid-cols-2">
      <Panel variant="plain" className="self-start">
        <PanelHeader title="Checks" count={notes.length} aside="also listed in the Sunday email" />
        {notes.length ? (
          notes.map((n) => (
            <div key={n} className="border-b border-row py-2.5 text-body last:border-b-0">
              {n}
            </div>
          ))
        ) : (
          <p className="py-3 text-body text-muted-foreground">Nothing to double-check this week.</p>
        )}
      </Panel>
      <Panel variant="plain" className="self-start">
        <PanelHeader title="How this pack was built" count={steps.length} />
        {steps.length ? (
          steps.map(([step, v]) => (
            <div key={step} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-row py-2.5 last:border-b-0">
              <span className="text-body font-medium">{STEP_LABELS[step] ?? step}</span>
              <Pill className="justify-self-end" tone={v.status === "ok" ? "good" : v.status === "failed" ? "caution" : "neutral"}>{v.status === "ok" ? "OK" : v.status === "failed" ? "Failed" : "Held"}</Pill>
              <span className="text-body text-muted-foreground">
                {[v.detail, v.error].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="text-caption text-muted-foreground">{fmtDateTime(v.at)}</span>
            </div>
          ))
        ) : (
          <p className="py-3 text-body text-muted-foreground">No build steps recorded yet.</p>
        )}
        <PanelFooter>A step that failed costs only its own section; the Sunday email&apos;s Checks list says which part to fill in by hand.</PanelFooter>
      </Panel>
    </div>
  );
}
