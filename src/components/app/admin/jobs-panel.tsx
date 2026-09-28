"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { runBellwethersNow, runCloseNow, runDailyBriefNow, runEarningsPrepNow, runMorningNow, runPricesNow, runWeeklyNow } from "@/lib/actions/jobs";
import { setWeeklyRecipients } from "@/lib/actions/admin";
import { Panel, PanelHeader } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { summarizeJob } from "./job-runs-live";


/** A job's latest run, as the Scheduled jobs panel shows it. */
export type JobLastRun = { startedAt: string; finishedAt: string | null; ok: boolean | null; summary: Record<string, unknown> };

export type JobsPanelProps = {
  canMutate: boolean;
  /** Latest run by `job_runs.job` name. */
  last: Record<string, JobLastRun | null>;
  /** Who the weekly pack goes to, as saved (blank = default) and as a label. */
  weekly: { recipients: string | null; to: string };
};

type Tone = "good" | "caution" | "down" | "muted";
type JobKey = "close" | "prices" | "brief" | "morning" | "bellwethers" | "prep" | "weekly";
type JobDef = { key: JobKey; name: string; when: string; run: (fd: FormData) => Promise<void>; runs?: string; options?: boolean; detail?: string };

function jobs(weeklyTo: string): JobDef[] {
  return [
    { key: "close", name: "Close check", when: "Weekdays 17:00 ET · 400 bp movement rule", runs: "close", run: runCloseNow, options: true, detail: "Supabase pg_cron at 17:00 ET, with a 19:00 ET Vercel backstop. Opens a movement for any holding that moved 4 pp or more against the S&P 500." },
    { key: "prices", name: "Price history", when: "Weekdays 17:00 ET · closes, dividends, splits", runs: "prices", run: runPricesNow, detail: "Attribution closes, dividends and splits. Vercel backstop at 19:30 ET." },
    {
      key: "brief",
      name: "Hoot's daily brief",
      when: "Weekdays 17:05 ET · email 17:15 ET",
      runs: "daily_brief",
      run: runDailyBriefNow,
      options: true,
      detail: "Prices and close check at 17:00 ET, Hoot's analysis at 17:05 ET, email to Aadi, Saad, Rikhil and Max at 17:15 ET. If the email fails it is retried every 15 minutes until midnight, and admins are emailed once it is late. Run now emails only you unless you choose everyone.",
    },
    { key: "morning", name: "Morning sweep", when: "Weekdays 10:00 ET · reminders, earnings, filings, Drive", runs: "morning", run: runMorningNow, detail: "Reminders, earnings, evidence, sector bellwethers, earnings prep packs, the SEC filings index and a full Drive crawl." },
    { key: "bellwethers", name: "Sector bellwethers", when: "Inside the morning sweep · ETF constituents, report dates", run: runBellwethersNow, detail: "ETF constituents, earnings dates and industries." },
    { key: "prep", name: "Earnings prep packs", when: "Inside the morning sweep · next 5 trading days", run: runEarningsPrepNow, detail: "Agent-gathered evidence for reports in the next five trading days, up to three per run." },
    {
      key: "weekly",
      name: "Weekly update pack",
      when: `Sundays 12:00 ET · to ${weeklyTo}`,
      runs: "weekly",
      run: runWeeklyNow,
      options: true,
      detail: "Builds the pack for last Friday, then Hoot emails it. Sunday 12:00 ET (Supabase pg_cron), Vercel backstop 19:00 UTC. A test account (*.owlfund.local) alone on the list pauses the email.",
    },
  ];
}

function status(key: JobKey, r: JobLastRun | null | undefined): { text: string; tone: Tone } {
  if (!r) return { text: key === "bellwethers" || key === "prep" ? "Runs with the sweep" : "No runs yet", tone: "muted" };
  if (!r.finishedAt) return { text: "Running", tone: "muted" };
  if (r.ok === false) return { text: "Failed", tone: "down" };
  const s = r.summary as { status?: string; created?: unknown[]; reminders?: number; updated?: unknown[]; email?: { status?: string }; build?: { status?: string } };
  if (s.status === "skipped") return { text: "Skipped", tone: "muted" };
  if (key === "close") return { text: `OK · ${s.created?.length ?? 0} opened`, tone: "good" };
  if (key === "morning" && s.reminders !== undefined) return { text: `OK · ${s.reminders} ${s.reminders === 1 ? "reminder" : "reminders"}`, tone: "good" };
  if (key === "prices" && s.updated) return { text: `OK · ${s.updated.length} updated`, tone: "good" };
  if (key === "weekly") return s.email?.status === "sent" ? { text: "Built · sent", tone: "good" } : { text: "Built · not sent", tone: "caution" };
  return { text: "OK", tone: "good" };
}

const TONE: Record<Tone, string> = { good: "text-good-foreground", caution: "text-caution-foreground", down: "text-down", muted: "text-muted-foreground" };

const stamp = (iso: string) => fmtDateTime(iso);

/** S16 right column, bottom: each scheduled job with its schedule, last result and a Run now. */
export function JobsPanel({ canMutate, last, weekly }: JobsPanelProps) {
  const [options, setOptions] = useState<JobKey | null>(null);
  const list = jobs(weekly.to);
  return (
    <Panel>
      <PanelHeader title="Scheduled jobs" aside="New York time" />
      <div className="flex flex-col">
        {list.map((j) => {
          const r = j.runs ? last[j.runs] : null;
          const st = status(j.key, r);
          return (
            <div key={j.key} className="flex min-h-14 items-center gap-3 border-b border-row px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1" title={j.detail}>
                <div className="text-[13.5px] font-semibold">{j.name}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{j.when}</div>
              </div>
              <div className="shrink-0 text-right" title={r ? summarizeJob(r.summary) || undefined : undefined}>
                <div className={cn("text-[12.5px] font-medium", TONE[st.tone])}>{st.text}</div>
                {r && <div className="font-mono text-[11px] text-muted-foreground">{stamp(r.startedAt)}</div>}
              </div>
              {canMutate && (
                <div className="flex shrink-0 items-center gap-1">
                  <form action={j.run}>
                    <Button type="submit" size="sm" variant="outline">
                      Run now
                    </Button>
                  </form>
                  {j.options ? (
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`${j.name} options`} title="Run for a date, and other options" onClick={() => setOptions(j.key)}>
                      <SlidersHorizontal />
                    </Button>
                  ) : (
                    <span className="size-7" aria-hidden />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={options !== null} onOpenChange={(o) => !o && setOptions(null)}>
        <DialogContent className="sm:max-w-md">
          {options === "close" && (
            <>
              <DialogHeader>
                <DialogTitle>Close check (movements)</DialogTitle>
                <DialogDescription>Leave the date empty for today. Scheduled weekdays at 5:00 p.m. New York (Supabase pg_cron), with a 7 p.m. Vercel backstop.</DialogDescription>
              </DialogHeader>
              <form action={runCloseNow} className="grid gap-3">
                <Field label="Session date" htmlFor="job-date">
                  <Input id="job-date" name="date" type="date" className="w-44" />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <input type="checkbox" name="force" className="size-3.5" /> Re-run even if this session already completed
                </label>
                <DialogFooter>
                  <Button type="submit">Run</Button>
                </DialogFooter>
              </form>
            </>
          )}
          {options === "brief" && (
            <>
              <DialogHeader>
                <DialogTitle>Hoot&apos;s daily attribution brief</DialogTitle>
                <DialogDescription>{list.find((j) => j.key === "brief")?.detail}</DialogDescription>
              </DialogHeader>
              <form action={runDailyBriefNow} className="grid gap-3">
                <Field label="Session date" htmlFor="brief-date">
                  <Input id="brief-date" name="date" type="date" className="w-44" />
                </Field>
                <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <input type="checkbox" name="everyone" className="size-3.5" /> Email everyone on the list, not just me
                </label>
                <DialogFooter>
                  <Button type="submit">Run</Button>
                </DialogFooter>
              </form>
            </>
          )}
          {options === "weekly" && (
            <>
              <DialogHeader>
                <DialogTitle>Weekly update pack</DialogTitle>
                <DialogDescription>Pack for last Friday, then Hoot emails it. Leave the date empty for today. Sunday 12:00 ET (Supabase pg_cron), Vercel backstop 19:00 UTC.</DialogDescription>
              </DialogHeader>
              <form action={runWeeklyNow} className="grid gap-3">
                <Field label="Run as if today were" htmlFor="weekly-date">
                  <Input id="weekly-date" name="date" type="date" className="w-44" />
                </Field>
                <div>
                  <Button type="submit">Run</Button>
                </div>
              </form>
              <form action={setWeeklyRecipients} className="grid gap-1.5 border-t pt-3">
                <Label htmlFor="weekly-recipients">Email the pack to (first in To, the rest in CC; blank = Aadi, CC Saad)</Label>
                <div className="flex items-center gap-2">
                  <Input id="weekly-recipients" name="recipients" defaultValue={weekly.recipients ?? ""} placeholder="apatil@theowlfund.com, squddus@theowlfund.com" />
                  <Button type="submit" variant="outline">
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Now going to {weekly.to}. A test account (*.owlfund.local) alone pauses it.</p>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
