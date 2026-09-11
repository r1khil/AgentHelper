import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { invite } from "../actions";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/app/action-form";
import { SubmitButton } from "@/components/app/submit-button";
import { JobBadge } from "@/components/app/status-badge";
import { Timestamp } from "@/components/app/timestamp";
import { EmptyState } from "@/components/app/empty-state";
import { AlertIcon } from "@/components/app/icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invitation?: string }>;
}) {
  const a = await requireActor();
  if (!a.admin) notFound();

  const query = await searchParams;
  const jobs = await db()`select * from job order by created_at desc limit 100`;
  const failures = await db()`
    select q.*, h.ticker
    from quality_failure q join holding h on h.id = q.holding_id
    order by q.created_at desc limit 50`;
  const audit = await db()`select * from audit_event order by created_at desc limit 50`;
  const teams = await db()`select * from team order by name`;

  const unresolved = failures.filter((f) => !f.resolved_at);
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Operations"
        title="Administration"
        description="Replay results, job failures, invitations, and the audit trail."
      >
        <div className="flex gap-2">
          <ActionForm
            op="replay"
            returnTo="/admin"
            label="Replay THC + DRAM"
            pendingLabel="Replaying…"
            buttonClassName={buttonVariants({ size: "sm" })}
          />
          <ActionForm
            op="worker"
            returnTo="/admin"
            label="Process due jobs"
            pendingLabel="Processing…"
            buttonClassName={buttonVariants({ variant: "outline", size: "sm" })}
          />
        </div>
      </PageHeader>

      {query.error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">Your last action failed</strong> —{" "}
            {query.error}
          </span>
        </Alert>
      )}

      <Alert variant="muted" className="mb-6">
        Development mode: synthetic observations, captured emails, and fixture
        feedback. No paid data or model integrations are enabled.
      </Alert>

      {(unresolved.length > 0 || failedJobs.length > 0) && (
        <div className="mb-6 grid gap-2">
          {unresolved.length > 0 && (
            <Alert variant="destructive" className="flex items-center gap-2.5">
              <AlertIcon className="size-4" />
              <span>
                <strong className="font-semibold">
                  {unresolved.length} unresolved data-quality failure
                  {unresolved.length === 1 ? "" : "s"}
                </strong>{" "}
                — bad inputs must not become a silent non-event.
              </span>
            </Alert>
          )}
          {failedJobs.length > 0 && (
            <Alert variant="destructive" className="flex items-center gap-2.5">
              <AlertIcon className="size-4" />
              <span>
                <strong className="font-semibold">
                  {failedJobs.length} failed job
                  {failedJobs.length === 1 ? "" : "s"}
                </strong>{" "}
                — a failed delivery must stay visible until it is resolved.
              </span>
            </Alert>
          )}
        </div>
      )}

      <Section title="Invite a developer" />
      <Card className="mb-8 p-5">
        <form action={invite} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              Email
              <Input type="email" name="email" required />
            </Field>
            <Field>
              Team
              <Select name="teamId">
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              Role
              <Select name="role">
                <option value="member">Member</option>
                <option value="lead">Team lead</option>
              </Select>
            </Field>
          </div>
          <SubmitButton
            className={buttonVariants({ className: "justify-self-start" })}
            pendingLabel="Creating…"
          >
            Create one-time invitation
          </SubmitButton>
        </form>

        {query.invitation && (
          <Alert className="mt-4">
            <p className="mt-0 mb-2 text-xs">
              Share privately. The recipient signs in, opens “Join a team,” and
              enters this code. It is single-use and expires in seven days.
            </p>
            <code className="bg-card border-border block rounded border px-3 py-2 font-mono text-xs break-all select-all">
              {query.invitation}
            </code>
          </Alert>
        )}
      </Card>

      <Section title="Data quality" note="Exposed for resolution" />
      {failures.length ? (
        <Card className="mb-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-semibold">{f.ticker}</TableCell>
                  <TableCell>{f.session}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {f.message}
                  </TableCell>
                  <TableCell>
                    <JobBadge status={f.resolved_at ? "succeeded" : "failed"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState className="mb-8">
          No data-quality failures recorded.
        </EmptyState>
      )}

      <Section title="Durable jobs" note={`Most recent ${jobs.length}`} />
      {jobs.length ? (
        <Card className="mb-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Scheduled · Eastern</TableHead>
                <TableHead>Error / action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>{j.kind}</TableCell>
                  {/* Job identity was missing entirely, which made a failed
                      delivery impossible to trace back to its investigation. */}
                  <TableCell className="text-muted-foreground font-mono text-[11px]">
                    {String(j.id).slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <JobBadge status={j.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {j.attempts}
                  </TableCell>
                  <TableCell>
                    <Timestamp value={j.run_at} />
                  </TableCell>
                  <TableCell>
                    {j.last_error && (
                      <div className="text-quality-fail mb-1 text-[11px]">
                        {j.last_error}
                      </div>
                    )}
                    {j.status === "failed" && (
                      <ActionForm
                        op="retry"
                        id={j.id}
                        returnTo="/admin"
                        label="Retry job"
                        pendingLabel="Retrying…"
                        buttonClassName={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState className="mb-8">No jobs have run yet.</EmptyState>
      )}

      <Section title="Audit trail" note={`Most recent ${audit.length}`} />
      {audit.length ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Time · Eastern</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.action}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {e.actor_id ?? "System"}
                  </TableCell>
                  <TableCell>
                    <Timestamp value={e.created_at} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState>No audit events recorded.</EmptyState>
      )}
    </AppShell>
  );
}

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-serif text-lg">{title}</h2>
      {note && (
        <span className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
          {note}
        </span>
      )}
    </div>
  );
}
