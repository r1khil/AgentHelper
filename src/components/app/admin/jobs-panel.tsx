"use client";

import { useState } from "react";
import { runBellwethersNow, runCloseNow, runDailyBriefNow, runEarningsPrepNow, runMorningNow, runPricesNow, runWeeklyNow } from "@/lib/actions/jobs";
import { setWeeklyRecipients } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAILY_BRIEF_RECIPIENTS } from "@/lib/jobs/daily-brief-format";
import { cn } from "@/lib/utils";
import { summarizeJob } from "./job-runs-live";
import { jobResult, type JobKey, type JobLastRun } from "./status";

export type { JobLastRun } from "./status";

export type JobsPanelProps = {
  canMutate: boolean;
  /** Latest run by `job_runs.job` name. */
  last: Record<string, JobLastRun | null>;
  /** Who the weekly pack goes to, as saved (blank = default) and as words. */
  weekly: { recipients: string | null; to: string };
  /** The admin pressing the buttons, for "Send to me only". */
  meEmail: string;
};

type Ask = {
  /** Who gets email from this job, said plainly. */
  who: React.ReactNode;
  /** What the "send" button says. */
  send: string;
  /** The brief can go to just the admin running it. */
  toMe?: boolean;
  /** Extra fields in the confirmation. */
  date?: string;
  force?: boolean;
};
type JobDef = { key: JobKey; name: string; when: string; run: (fd: FormData) => Promise<void>; runs?: string; detail?: string; ask?: Ask };

function jobs(weekly: JobsPanelProps["weekly"]): JobDef[] {
  const brief = DAILY_BRIEF_RECIPIENTS;
  return [
    {
      key: "close",
      name: "Close check",
      when: "Weekdays 5:00 PM ET · opens movements",
      runs: "close",
      run: runCloseNow,
      detail: "Supabase pg_cron at 5:00 PM ET, with a 7:00 PM ET Vercel backstop. Opens a movement for any holding that moved 400 bp or more against the S&P 500.",
      ask: {
        who: "the leads of each team whose holding moves 400 bp or more against the S&P 500 (its members when a team has no lead). Nothing goes out if no new movement opens",
        send: "Run and email leads",
        date: "Session date",
        force: true,
      },
    },
    { key: "prices", name: "Price history", when: "Weekdays 5:00 PM ET", runs: "prices", run: runPricesNow, detail: "Attribution closes, dividends and splits. Vercel backstop at 7:30 PM ET." },
    {
      key: "brief",
      name: "Hoot's evening brief",
      when: "Weekdays 5:05 PM ET · emails the fund",
      runs: "daily_brief",
      run: runDailyBriefNow,
      detail: "Prices and close check at 5:00 PM ET, Hoot's analysis at 5:05 PM ET, email at 5:15 PM ET. If the email fails it is retried every 15 minutes until midnight, and admins are emailed once it is late.",
      ask: { who: `${brief.length} people: ${brief.map((r) => r.name).join(", ")}`, send: `Send to ${brief.length} people`, toMe: true, date: "Session date" },
    },
    {
      key: "morning",
      name: "Morning sweep",
      when: "Weekdays 10:00 AM ET · emails leads",
      runs: "morning",
      run: runMorningNow,
      detail: "Reminders, earnings, evidence, sector bellwethers, earnings prep packs, the SEC filings index and a full Drive crawl.",
      ask: { who: "the leads of teams with a write-up due today or overdue, and of teams with a new earnings prep pack (their members when a team has no lead)", send: "Run and email leads" },
    },
    { key: "bellwethers", name: "Sector bellwethers", when: "Inside the morning sweep · ETF constituents, report dates", run: runBellwethersNow, detail: "ETF constituents, earnings dates and industries." },
    {
      key: "prep",
      name: "Earnings prep packs",
      when: "Inside the morning sweep · next 5 trading days",
      run: runEarningsPrepNow,
      detail: "Agent-gathered evidence for reports in the next five trading days, up to three per run.",
      ask: { who: "the leads of each team whose pack is built (their members when a team has no lead)", send: "Run and email leads" },
    },
    {
      key: "weekly",
      name: "Weekly update pack",
      when: "Sundays 12:00 PM ET · emails the weekly list",
      runs: "weekly",
      run: runWeeklyNow,
      detail: "Builds the pack for last Friday, then Hoot emails it. Sunday 12:00 PM ET (Supabase pg_cron), Vercel backstop 7:00 PM UTC. A test account (*.owlfund.local) alone on the list pauses the email.",
      ask: { who: `${weekly.to}`, send: "Run and email the pack", date: "Run as if today were" },
    },
  ];
}

/** Scheduled jobs: each with its schedule, what its last run did in words, and a way to run it. A job that emails people asks first. */
export function JobsPanel({ canMutate, last, weekly, meEmail }: JobsPanelProps) {
  const [asking, setAsking] = useState<JobKey | null>(null);
  const list = jobs(weekly);
  return (
    <section aria-labelledby="jobs">
      <h2 id="jobs" className="mb-1 text-title font-bold tracking-[-0.01em]">
        Scheduled jobs
      </h2>
      <div className="flex flex-col">
        {list.map((j) => {
          const r = j.runs ? last[j.runs] : null;
          const res = jobResult(j.key, r);
          const open = asking === j.key;
          return (
            <div key={j.key} className="border-b border-row">
              <div className={cn("grid min-h-12 items-center gap-3 text-body", canMutate ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]")}>
                <span className="flex min-w-0 flex-col py-1" title={j.detail}>
                  <b className="font-semibold">{j.name}</b>
                  <span className="text-caption text-muted-foreground">{j.when}</span>
                </span>
                <span className={cn("py-1", res.attention ? "text-caution-foreground" : "text-ink-3")} title={r ? summarizeJob(r.summary) || undefined : undefined}>
                  {res.text}
                </span>
                {canMutate &&
                  (j.ask ? (
                    <Button type="button" size="sm" variant="secondary" className="w-[76px]" aria-expanded={open} aria-controls={`ask-${j.key}`} onClick={() => setAsking(open ? null : j.key)}>
                      Run…
                    </Button>
                  ) : (
                    <form action={j.run}>
                      <Button type="submit" size="sm" variant="secondary" className="w-[76px]">
                        Run now
                      </Button>
                    </form>
                  ))}
              </div>
              {canMutate && open && j.ask && <ConfirmRun id={`ask-${j.key}`} job={j} ask={j.ask} meEmail={meEmail} onCancel={() => setAsking(null)} />}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-caption text-muted-foreground">Jobs that email people ask first and name the recipients.</p>
      {canMutate && (
        <details className="mt-3 text-body">
          <summary className="w-fit cursor-pointer rounded-sm text-caption font-semibold select-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">Who gets the weekly email</summary>
          <form action={setWeeklyRecipients} className="mt-2 grid max-w-[560px] gap-1.5">
            <Label htmlFor="weekly-recipients">Email the pack to (first in To, the rest in CC; blank = Aadi, CC Saad)</Label>
            <div className="flex items-center gap-2">
              <Input id="weekly-recipients" name="recipients" defaultValue={weekly.recipients ?? ""} placeholder="apatil@theowlfund.com, squddus@theowlfund.com" />
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">Now going to {weekly.to}. A test account (*.owlfund.local) alone pauses it. Saving changes who gets the Sunday email and sends nothing.</p>
          </form>
        </details>
      )}
    </section>
  );
}

/**
 * The ask before a job that emails people runs: who gets email, and a plain way to run it without sending. Nothing is sent
 * until a send button is pressed; the form posts `send` so the action knows.
 */
function ConfirmRun({ id, job, ask, meEmail, onCancel }: { id: string; job: JobDef; ask: Ask; meEmail: string; onCancel: () => void }) {
  return (
    <form id={id} action={job.run} role="alertdialog" aria-label={`Confirm sending for ${job.name}`} className="flex flex-col gap-3 pt-3 pb-3.5 text-body">
      <span className="leading-5">
        <b className="font-semibold">This can email {ask.who}</b> <span className="text-ink-2">via OpenMail. Test accounts never get it.</span>
      </span>
      {(ask.date || ask.force) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {ask.date && (
            <span className="flex items-center gap-2">
              <Label htmlFor={`${id}-date`}>{ask.date}</Label>
              <Input id={`${id}-date`} name="date" type="date" className="w-44" />
              <span className="text-caption text-muted-foreground">Empty means today</span>
            </span>
          )}
          {ask.force && (
            <label className="flex items-center gap-2 text-ink-2">
              <input type="checkbox" name="force" className="size-3.5" /> Re-run even if this session already completed
            </label>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" variant="secondary" name="send" value="none" autoFocus>
          Run without sending
        </Button>
        {ask.toMe && (
          <Button type="submit" size="sm" variant="secondary" name="send" value="me" title={`Emails ${meEmail} only`}>
            Send to me only
          </Button>
        )}
        <Button type="submit" size="sm" name="send" value="list">
          {ask.send}
        </Button>
      </div>
    </form>
  );
}
