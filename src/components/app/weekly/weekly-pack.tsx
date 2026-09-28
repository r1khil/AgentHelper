"use client";

import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { useFormStatus } from "react-dom";
import { Copy, Ellipsis, Lock, Mail, RefreshCw, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelFooter, PanelHeader, Pill, StatStrip, type StatCell } from "@/components/app/panel";
import { Tabs, tabPanelProps } from "@/components/app/tabs";
import { Move } from "@/components/app/move";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { CopyButton } from "./copy-button";
import { PackStatusPill } from "./status-pill";
import { buildWeeklyNow, fillWeeklyFromSheet, markWeeklySent, reopenWeekly, saveWeeklyField, saveWeeklyFigures, sendWeeklyEmailNow } from "@/lib/actions/weekly";
import { WEEKDAYS, agendaLine, fmtAumK, fmtDeckPct, itemsToLines, packText, performerLine } from "@/lib/weekly/format";
import { carriedFigureKeys, deriveRelative, parseFigureInput } from "@/lib/weekly/figures";
import { AGENDA_LABELS, AGENDA_SECTIONS, type AgendaItem, type Performer, type WeeklyFigures } from "@/lib/weekly/types";
import type { PackStatus } from "@/lib/weekly/status";
import { packTitle, reviewWeek, weekRangeLabel } from "@/lib/weekly/weeks";
import { fmtBp, fmtDateTime, fmtDay, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EmailView, WeeklyPackProps } from "./types";
import { whenBuilt } from "./when";

export type { EmailView, WeeklyPackProps } from "./types";

const NY = "America/New_York";
const TABS = ["summary", "email", "highlights", "agenda", "checks"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { summary: "Summary", email: "Email", highlights: "Highlights", agenda: "Agenda", checks: "Checks" };


export function WeeklyPack(props: WeeklyPackProps) {
  const sent = props.status === "sent";
  const [tab, setTab] = useState<Tab>("summary");
  const [aumK, setAumK] = useState(props.figures.aumK.value === null ? "" : String(props.figures.aumK.value));
  const [ytdPct, setYtdPct] = useState(props.figures.ytdPct.value === null ? "" : String(props.figures.ytdPct.value));
  const [benchmarkYtdPct, setBenchmarkYtdPct] = useState(props.figures.benchmarkYtdPct.value === null ? "" : String(props.figures.benchmarkYtdPct.value));
  const markRef = useRef<HTMLFormElement>(null);
  const meRef = useRef<HTMLFormElement>(null);

  const num = (raw: string) => {
    const v = parseFigureInput(raw);
    return v === undefined ? null : v;
  };
  const relative = deriveRelative(num(ytdPct), num(benchmarkYtdPct));
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

  const email = props.email;
  const name = (addr: string) => email?.names[addr.toLowerCase()] ?? addr;
  const sentBefore = email?.record?.status === "ok";
  const agendaCount = props.agenda.earnings.length + props.agenda.marketNews.length + props.agenda.processUpdates.length;
  const title = fmtDay(props.weekEnding);
  const meta = [
    props.builtAt ? `Built ${whenBuilt(props.builtAt)}` : "Not built yet",
    props.editedAt ? `edited ${fmtDateTime(props.editedAt)}` : null,
    email?.to ? `to ${name(email.to)}${email.cc.length ? `, ${email.cc.map(name).join(", ")} in CC` : ""}` : email ? "email paused" : null,
    `${agendaCount} agenda ${agendaCount === 1 ? "item" : "items"}`,
  ].filter(Boolean);

  // The email's own record shows on the Email tab.
  const failedSteps = Object.entries(props.sources).filter(([step, v]) => v.status === "failed" && step !== "email");
  const carried = carriedFigureKeys(props.figures);
  const missing = props.performers?.missing ?? [];
  const checks = props.performers?.checks ?? [];
  const checkCount = checks.length + (missing.length ? 1 : 0) + (carried.length ? 1 : 0) + failedSteps.length;

  const { fund, spx, movementsOpened } = props.stats;
  const diffBp = fund !== null && spx !== null ? Math.round((fund - spx) * 10_000) : null;
  const cells: StatCell[] = [
    { label: "Fund, week", value: fmtPct(fund === null ? null : fund * 100), tone: fund === null ? null : fund > 0 ? "up" : fund < 0 ? "down" : null },
    { label: "S&P 500, week", value: fmtPct(spx === null ? null : spx * 100) },
    { label: "Difference", value: fmtBp(diffBp), tone: diffBp === null ? null : diffBp > 0 ? "up" : diffBp < 0 ? "down" : null },
    { label: "Movements opened", value: movementsOpened ?? "—" },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      {props.builtAt && !sent && <HootMoodFor mood="happy" />}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-[-0.015em]" title={packTitle(props.weekEnding)}>
            Week ending {title}
          </h2>
          <p className="mt-0.5 text-body text-muted-foreground">{meta.join(" · ")}</p>
        </div>
        <form action={buildWeeklyNow}>
          <input type="hidden" name="week" value={props.weekEnding} />
          <Button type="submit" size="lg" variant="outline">
            <RefreshCw data-icon="inline-start" />
            Rebuild
          </Button>
        </form>
        {email &&
          (sentBefore ? (
            <SendAgainButton week={props.weekEnding} email={email} size="lg" />
          ) : (
            <form action={sendWeeklyEmailNow}>
              <input type="hidden" name="week" value={props.weekEnding} />
              <input type="hidden" name="mode" value="list" />
              <Button type="submit" size="lg" disabled={!email.to}>
                <Send data-icon="inline-start" />
                {email.to ? `Send to ${name(email.to)}` : "Send now"}
              </Button>
            </form>
          ))}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon-lg" variant="outline" aria-label="More pack actions" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(whole).catch(() => {})}>
              <Copy />
              Copy whole pack
            </DropdownMenuItem>
            {email && (
              <DropdownMenuItem onClick={() => meRef.current?.requestSubmit()}>
                <Mail />
                Send a copy to me
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* Marking sent locks the pack. Once the email has gone out the pack is already Sent, so all that's left is the lock. */}
            <DropdownMenuItem onClick={() => markRef.current?.requestSubmit()}>
              {sent ? <Undo2 /> : props.state === "sent" ? <Lock /> : <Send />}
              {sent ? "Reopen for edits" : props.state === "sent" ? "Lock edits" : "Mark sent"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <form ref={markRef} action={sent ? reopenWeekly : markWeeklySent} hidden>
          <input type="hidden" name="week" value={props.weekEnding} />
        </form>
        <form ref={meRef} action={sendWeeklyEmailNow} hidden>
          <input type="hidden" name="week" value={props.weekEnding} />
          <input type="hidden" name="mode" value="me" />
        </form>
      </div>

      {sent && <Banner>This pack is marked sent{props.sentAt ? ` (${fmtDateTime(props.sentAt)})` : ""}. The Sunday job leaves it alone; reopen it from ⋯ to make changes.</Banner>}
      {failedSteps.length > 0 && (
        <Banner tone="caution">
          Could not build: {failedSteps.map(([step, v]) => `${step} (${v.error ?? "unknown error"})`).join("; ")}. Everything else on this page is current.
        </Banner>
      )}

      <StatStrip cells={cells} />

      <Tabs
        label="Pack sections"
        idBase="weekly-pack"
        className="-mt-1"
        onSelect={(k) => setTab(k as Tab)}
        items={TABS.map((t) => ({
          key: t,
          label: TAB_LABELS[t],
          active: tab === t,
          count: t === "checks" ? (checkCount > 0 ? checkCount : undefined) : t === "agenda" ? agendaCount : undefined,
        }))}
      />

      <div {...tabPanelProps("weekly-pack", tab)} className="flex min-h-0 flex-1 flex-col gap-5">
        {tab === "summary" && <SummaryGrid {...props} />}
        {tab === "email" && (email ? <EmailPanel week={props.weekEnding} state={props.state} sentAt={props.sentAt} email={email} name={name} /> : <Banner>The email can be written once the pack is built.</Banner>)}
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
  return <div className={cn("shrink-0 rounded-[10px] px-3.5 py-2 text-body", tone === "caution" ? "bg-caution text-caution-foreground" : "bg-band text-ink-2")}>{children}</div>;
}

/* ---------- Summary: the 2×2 grid ---------- */

function SummaryGrid(props: WeeklyPackProps) {
  const teamOf = (t: string) => props.teamByTicker[t.toUpperCase()];
  const why = props.performers?.source === "sheet" ? "Ranked from the PT sheet's % 1 Week" : "Ranked from the app's Monday and Friday closes";
  const notes = props.performers?.why ?? [];
  return (
    <>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <PerformerPanel title="Best performers" section="Top 3 Performers" list={props.performers?.top ?? []} teamOf={teamOf} why={why} />
      <PerformerPanel title="Worst performers" section="Worst 3 Performers" list={props.performers?.worst ?? []} teamOf={teamOf} why={why} />
      <DayPanel
        title="Next week's earnings"
        aside="holdings, bellwethers, largest reporters"
        label={AGENDA_LABELS.earnings}
        items={props.agenda.earnings}
        from={props.agendaRange.from}
        note={(t) => props.teamByTicker[t.toUpperCase()] ?? props.bellwetherByTicker[t.toUpperCase()]}
        mono
      />
      <DayPanel title="Economic releases" aside="from the economic calendar" label={AGENDA_LABELS.marketNews} items={props.agenda.marketNews} from={props.agendaRange.from} />
    </div>
    {notes.length > 0 && (
      // Hoot wrote these from the week's headlines, so each one cites its headline in pink.
      <PanelShell title="Why they moved" aside="Hoot's read of the news, not for the slide">
        {notes.map((w) => (
          <div key={w.ticker} className="flex items-baseline gap-4 px-4 py-2 text-body">
            <span className="w-14 shrink-0 font-mono font-semibold">{w.ticker}</span>
            <span className="min-w-0 flex-1">{w.text}</span>
            <a href={w.url} target="_blank" rel="noreferrer" title={w.headline} className="shrink-0 rounded-full bg-hoot px-2 py-0.5 text-caption text-hoot-foreground hover:underline">
              {w.source}
            </a>
          </div>
        ))}
      </PanelShell>
    )}
    </>
  );
}

function PanelShell({ title, aside, copy, children }: { title: string; aside: React.ReactNode; copy?: string; children: React.ReactNode }) {
  return (
    <Panel variant="plain">
      <PanelHeader
        title={title}
        aside={
          <>
            <span className="text-body">{aside}</span>
            {copy && <CopyIcon text={copy} label={`Copy ${title}`} />}
          </>
        }
      />
      <div className="flex flex-col">{children}</div>
    </Panel>
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

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex min-h-10 items-center gap-2.5 px-4 text-body", className)}>{children}</div>;
}

function PerformerPanel({ title, section, list, teamOf, why }: { title: string; section: string; list: Performer[]; teamOf: (t: string) => string | undefined; why: string }) {
  const lines = list.map(performerLine);
  return (
    <PanelShell title={title} aside={<span title={why}>week, price return</span>} copy={lines.length ? `${section}\n${lines.join("\n")}` : undefined}>
      {list.length ? (
        list.map((p) => (
          <Row key={p.ticker}>
            <span className="w-[84px] shrink-0 font-mono text-body font-semibold">{p.ticker}</span>
            <span className="min-w-0 flex-1 truncate" title={performerLine(p)}>
              {p.name}
              {teamOf(p.ticker) && <span className="text-ink-2"> · {teamOf(p.ticker)}</span>}
            </span>
            <Move value={p.pct} unit="%" className="text-body" />
          </Row>
        ))
      ) : (
        <p className="p-4 text-body text-muted-foreground">Nothing to rank yet. Friday&apos;s closes arrive with the price history job.</p>
      )}
    </PanelShell>
  );
}

/** One row per weekday of the agenda week (Monday first), so an empty day reads as empty rather than missing. */
function DayPanel({ title, aside, label, items, from, note, mono }: { title: string; aside: string; label: string; items: AgendaItem[]; from: string; note?: (text: string) => string | undefined; mono?: boolean }) {
  const monday = DateTime.fromISO(from, { zone: NY });
  const days: { key: string; stamp: string; items: AgendaItem[] }[] = WEEKDAYS.slice(0, 5).map((day, i) => ({ key: day as string, stamp: fmtDay(monday.plus({ days: i }).toISODate()!), items: items.filter((it) => it.day === day) }));
  const other = items.filter((it) => !it.day || !WEEKDAYS.slice(0, 5).includes(it.day as (typeof WEEKDAYS)[number]));
  if (other.length) days.push({ key: "other", stamp: "No day", items: other });
  return (
    <PanelShell title={title} aside={aside} copy={agendaLine(label, items)}>
      {days.map((d) => (
        <Row key={d.key} className="items-center py-2">
          <span className="w-[92px] shrink-0 font-mono text-body font-semibold">{d.stamp}</span>
          <span className="min-w-0 flex-1 leading-relaxed">
            {d.items.length === 0 ? (
              <span className="text-muted-foreground">Nothing scheduled</span>
            ) : (
              d.items.map((it, i) => {
                const n = note?.(it.text);
                return (
                  <span key={`${it.text}-${i}`}>
                    {i > 0 && <span className="text-muted-foreground">{mono ? ", " : " · "}</span>}
                    <span className={cn(mono && "font-mono text-body font-medium")}>{it.text}</span>
                    {n && <span className="text-ink-2"> {n}</span>}
                  </span>
                );
              })
            )}
          </span>
        </Row>
      ))}
    </PanelShell>
  );
}

/* ---------- Email ---------- */

/** The line beside the status pill: what happened to the email, agreeing with the pill. */
function emailStatus(email: EmailView, state: PackStatus, sentAt: string | null): string {
  const r = email.record;
  if (r?.status === "ok") return `Sent ${fmtDateTime(r.at)} ${r.detail ?? ""}`.trim();
  if (state === "sent") return `Marked sent${sentAt ? ` ${fmtDateTime(sentAt)}` : ""}. Hoot has not emailed it to the list.`;
  if (r?.status === "failed") return `Last send failed ${fmtDateTime(r.at)}: ${r.error ?? "unknown error"}`;
  if (!email.to) return `Not sent. The list is paused: only test accounts are on it (${email.skipped.join(", ")}). Change it on the Admin page.`;
  if (state === "scheduled") return "Not sent yet. It goes out with the Sunday build at 12:00 New York time.";
  if (r?.status === "held") return `Not sent: ${r.detail ?? "held"}.`;
  return "Not sent. The Sunday run has passed, so it goes out only if you send it.";
}

function EmailPanel({ week, state, sentAt, email, name }: { week: string; state: PackStatus; sentAt: string | null; email: EmailView; name: (a: string) => string }) {
  const sentBefore = email.record?.status === "ok";
  return (
    <Panel>
      <PanelHeader title="Sunday email" aside={<CopyButton text={email.text} label="Copy email" />} />
      <div className="grid gap-3 border-b border-row px-4 py-3 text-body">
        <p className="text-ink-2">
          Hoot emails this pack, every data point in the deck&apos;s order, so the deck can be put together by pasting.{" "}
          {email.to ? (
            <>
              To {name(email.to)} ({email.to}){email.cc.length ? `, CC ${email.cc.map((c) => `${name(c)} (${c})`).join(", ")}` : ""}.
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <PackStatusPill state={state} />
          <span className="text-body text-muted-foreground">{emailStatus(email, state, sentAt)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sentBefore ? (
            <SendAgainButton week={week} email={email} />
          ) : (
            <form action={sendWeeklyEmailNow}>
              <input type="hidden" name="week" value={week} />
              <input type="hidden" name="mode" value="list" />
              <Button type="submit" disabled={!email.to}>
                <Send data-icon="inline-start" />
                Send now
              </Button>
            </form>
          )}
          <form action={sendWeeklyEmailNow}>
            <input type="hidden" name="week" value={week} />
            <input type="hidden" name="mode" value="me" />
            <Button type="submit" variant="outline">
              <Mail data-icon="inline-start" />
              Send a copy to me
            </Button>
          </form>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="label-mono mb-2 text-muted-foreground">Preview · {email.subject}</div>
        <pre className="min-h-0 flex-1 overflow-auto rounded-[10px] bg-band-2 p-3 font-mono text-body leading-relaxed whitespace-pre-wrap">{email.text}</pre>
      </div>
    </Panel>
  );
}

/**
 * "Send again" emails the whole list a second time, so it is a quiet button that asks first and names who gets it.
 * Confirming submits the same action the button always did.
 */
function SendAgainButton({ week, email, size }: { week: string; email: EmailView; size?: "lg" }) {
  const full = (addr: string) => email.fullNames[addr.toLowerCase()] ?? addr;
  const first = (addr: string) => email.names[addr.toLowerCase()] ?? addr;
  const review = reviewWeek(week);
  const who = email.to ? `${full(email.to)}${email.cc.length ? ` (cc ${email.cc.map(first).join(", ")})` : ""}` : "the list";
  return (
    <Dialog>
      <DialogTrigger render={<Button size={size} variant="ghost" disabled={!email.to} />}>
        <Send data-icon="inline-start" />
        Send again
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">
            Send the {weekRangeLabel(review.from, review.to)} pack to {who} again?
          </DialogTitle>
          <DialogDescription>
            It already went out{email.record?.at ? ` ${fmtDateTime(email.record.at)}` : ""}. This emails the pack as it stands now, as a new message.
          </DialogDescription>
        </DialogHeader>
        <form action={sendWeeklyEmailNow} className="flex justify-end gap-2">
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="mode" value="list" />
          <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
          <SendAgainSubmit />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SendAgainSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Send data-icon="inline-start" />
      {pending ? "Sending…" : "Send again"}
    </Button>
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
      <Panel>
        <PanelHeader title="Portfolio highlights" aside={sheetAsOf ? `sheet last edited ${fmtDateTime(sheetAsOf)}` : undefined} />
        <form action={saveWeeklyFigures} className="grid gap-3 p-4">
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
                <Input id={f.id} name={f.id} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} inputMode="decimal" disabled={sent} className="font-mono" />
                <span className="text-body text-muted-foreground">{figureNote(f.fig)}</span>
              </div>
            ))}
          </div>
          <p className="text-body leading-relaxed text-muted-foreground">
            The app reads these from the price target sheet&apos;s 2025 Time-Weighted Returns tab when it builds the pack; the benchmark is the cell the sheet labels &ldquo;SPX YTD
            Performance&rdquo;. Anything you type and save wins over the sheet. Relative return is YTD less the benchmark.
          </p>
          {!sent && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline">Save highlights</Button>
              <Button type="submit" variant="ghost" formAction={fillWeeklyFromSheet}>
                Refresh from PT sheet
              </Button>
            </div>
          )}
        </form>
      </Panel>
      <div className="grid content-start gap-5">
        <Panel>
          <PanelHeader title="As it goes in the deck" aside={<CopyButton text={`Portfolio Highlights\n${highlights.join("\n")}`} label="Copy section" />} />
          {highlights.map((l) => (
            <Line key={l} text={l} />
          ))}
        </Panel>
        <Panel>
          <PanelHeader title="YTD performance chart" />
          <p className="p-4 text-body text-muted-foreground">
            Still pasted by hand from the price target sheet (OF vs SPXTR, SVX, SGX). The daily history behind it isn&apos;t in the sheet tabs the app reads, so this chart stays manual.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function Line({ text }: { text: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 border-b border-row px-4 py-1 last:border-b-0">
      <span className="min-w-0 text-body break-words">{text}</span>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

/* ---------- Agenda ---------- */

function AgendaPanels(props: WeeklyPackProps & { sent: boolean }) {
  return (
    <div className="grid flex-1 content-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Panel className="self-start">
        <PanelHeader title="Last week's agenda" aside={<CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])).join("\n")} label="Copy section" />} />
        <p className="border-b border-row px-4 py-2 text-body text-muted-foreground">A snapshot of the previous pack&apos;s agenda. Rebuilding refreshes it; you cannot edit it here.</p>
        {AGENDA_SECTIONS.map((s) => (
          <Line key={s} text={agendaLine(AGENDA_LABELS[s], props.lastWeekAgenda[s])} />
        ))}
      </Panel>
      <Panel>
        <PanelHeader
          title="This week's agenda"
          aside={
            <>
              <span>covers {weekRangeLabel(props.agendaRange.from, props.agendaRange.to)}</span>
              <CopyButton text={AGENDA_SECTIONS.map((s) => agendaLine(AGENDA_LABELS[s], props.agenda[s])).join("\n")} label="Copy section" />
            </>
          }
        />
        <div className="grid gap-5 p-4">
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
        className="font-mono text-body"
      />
      <p className="text-body text-muted-foreground">One item per line, as &ldquo;Day: text&rdquo;. Renders as: {line}</p>
      {!disabled && (
        <div>
          <Button type="submit" size="sm" variant="outline">
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
      <Panel className="self-start">
        <PanelHeader title="Checks" count={notes.length} aside="also listed in the Sunday email" />
        {notes.length ? (
          notes.map((n) => (
            <div key={n} className="border-b border-row px-4 py-2.5 text-body last:border-b-0">
              {n}
            </div>
          ))
        ) : (
          <p className="p-4 text-body text-muted-foreground">Nothing to double-check this week.</p>
        )}
      </Panel>
      <Panel className="self-start">
        <PanelHeader title="How this pack was built" count={steps.length} />
        {steps.length ? (
          steps.map(([step, v]) => (
            <div key={step} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-row px-4 py-2.5 last:border-b-0">
              <span className="text-body font-medium">{STEP_LABELS[step] ?? step}</span>
              <Pill className="justify-self-end" tone={v.status === "ok" ? "good" : v.status === "failed" ? "caution" : "neutral"}>{v.status === "ok" ? "OK" : v.status === "failed" ? "Failed" : "Held"}</Pill>
              <span className="text-body text-muted-foreground">
                {[v.detail, v.error].filter(Boolean).join(" · ") || "—"}
              </span>
              <span className="font-mono text-caption text-muted-foreground">{fmtDateTime(v.at)}</span>
            </div>
          ))
        ) : (
          <p className="p-4 text-body text-muted-foreground">No build steps recorded yet.</p>
        )}
        <PanelFooter>A step that failed costs only its own section; the Sunday email&apos;s Checks list says which part to fill in by hand.</PanelFooter>
      </Panel>
    </div>
  );
}
