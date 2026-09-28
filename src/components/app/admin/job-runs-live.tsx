"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobRunView } from "@/app/api/admin/job-runs/route";
import type { JobProgressEvent } from "@/lib/jobs/progress-types";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;
/** Keep polling this long after a job form is submitted, so the new run row appears before its first step lands. */
const AFTER_SUBMIT_MS = 15_000;

export function summarizeJob(summary: Record<string, unknown>) {
  const s = summary as { status?: string; reason?: string; qualified?: string[]; created?: string[]; sessionDate?: string; reminders?: number; overdue?: number; evidenceFinished?: number; files?: number; matched?: number; unmatched?: string[]; error?: string; updated?: string[]; remaining?: string[] | number; embedded?: number; considered?: number; stopped?: string };
  if (s.files !== undefined) return `${s.reason ?? ""} · ${s.files} files, ${s.matched} matched${s.unmatched?.length ? `, ${s.unmatched.length} unmatched` : ""}`;
  if (s.error) return `${s.reason ?? ""} · ${s.error}`;
  if (s.embedded !== undefined)
    return `${s.reason ?? ""} · ${s.status === "rate_limited" ? "rate limited" : (s.status ?? "")} · ${s.embedded} embedded, ${typeof s.remaining === "number" ? s.remaining : 0} remaining${s.stopped ? ` · ${s.stopped}` : ""}`;
  if (s.sessionDate) return `${s.sessionDate} ${s.status ?? ""}${s.reason ? ` (${s.reason})` : ""}${s.qualified?.length ? ` · qualified ${s.qualified.join(", ")}` : ""}`;
  if (s.reminders !== undefined) return `reminders ${s.reminders}, overdue ${s.overdue}, evidence ${s.evidenceFinished}`;
  if (s.updated !== undefined) {
    const left = Array.isArray(s.remaining) ? s.remaining.length : 0;
    return `${s.status ?? ""}${s.reason ? ` (${s.reason})` : ""} · ${s.updated.length} updated${left ? `, ${left} remaining` : ""}`;
  }
  return "";
}

function stepLabel(e: JobProgressEvent | null) {
  if (!e) return null;
  const d = e.detail ?? {};
  const bit = typeof d.ticker === "string" ? d.ticker : typeof d.symbol === "string" ? d.symbol : null;
  return `${e.name}${e.n !== undefined ? ` ${e.n}/${e.of}` : ""}${bit ? ` · ${bit}` : ""}`;
}

/**
 * The job runs table, kept live: polls while any run is open (or right after a job was started
 * from this page) and, in transparency mode, expands a run to its step log.
 */
export function JobRunsLive({ initial, transparency }: { initial: JobRunView[]; transparency: boolean }) {
  const [runs, setRuns] = useState(initial);
  const [pollUntil, setPollUntil] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const anyRunning = runs.some((r) => r.finishedAt === null);

  // A job form on this page was submitted: watch for the new run.
  useEffect(() => {
    const onSubmit = () => setPollUntil(Date.now() + AFTER_SUBMIT_MS);
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);

  useEffect(() => {
    if (!anyRunning && Date.now() > pollUntil) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/job-runs", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { runs: JobRunView[] };
        if (!cancelled) setRuns(data.runs);
      } catch {
        // Next tick retries.
      }
    };
    void tick();
    const id = setInterval(() => {
      if (!anyRunning && Date.now() > pollUntil) return;
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [anyRunning, pollUntil]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {transparency && (
            <TableHead className="w-6">
              <span className="sr-only">Details</span>
            </TableHead>
          )}
          <TableHead>Job</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Step</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={transparency ? 5 : 4} className="text-muted-foreground">No runs yet.</TableCell>
          </TableRow>
        ) : (
          runs.map((r) => {
            const running = r.finishedAt === null;
            const isOpen = open === r.id;
            const canOpen = transparency && (r.progress?.length ?? 0) > 0;
            return (
              <RunRows key={r.id} r={r} running={running} isOpen={isOpen} canOpen={canOpen} transparency={transparency} onToggle={() => setOpen(isOpen ? null : r.id)} />
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function RunRows({ r, running, isOpen, canOpen, transparency, onToggle }: { r: JobRunView; running: boolean; isOpen: boolean; canOpen: boolean; transparency: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow className={cn(canOpen && "cursor-pointer")} onClick={canOpen ? onToggle : undefined} aria-expanded={canOpen ? isOpen : undefined}>
        {transparency && <TableCell className="px-2">{canOpen && <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />}</TableCell>}
        <TableCell className="font-medium">{r.job}</TableCell>
        <TableCell className="tnum text-muted-foreground">{fmtDateTime(r.startedAt)}</TableCell>
        <TableCell className="max-w-md truncate text-caption text-muted-foreground" title={JSON.stringify(r.summary)}>
          {running ? "running" : r.ok ? "ok" : "failed"} · {summarizeJob(r.summary)}
        </TableCell>
        <TableCell className="whitespace-nowrap text-body text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {running && <Loader2 className="size-3 animate-spin" />}
            {r.current?.kind === "error" && <TriangleAlert className="size-3 text-destructive" />}
            {stepLabel(r.current) ?? (running ? "starting" : "")}
          </span>
        </TableCell>
      </TableRow>
      {isOpen && r.progress && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={5} className="py-2">
            <ol className="grid gap-0.5 text-caption">
              {r.progress.map((e, i) => (
                <li key={i} className={cn("flex items-start gap-2", e.kind === "warn" && "text-warning-foreground", e.kind === "error" && "text-destructive")}>
                  <span className="tnum w-20 shrink-0 text-muted-foreground">{e.at.slice(11, 19)}</span>
                  <span className={cn("w-10 shrink-0 text-muted-foreground", e.kind === "item" && "pl-2")}>{e.kind}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{e.name}</span>
                    {e.n !== undefined && <span className="tnum"> {e.n}/{e.of}</span>}
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        {Object.entries(e.detail)
                          .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                          .join(" ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
