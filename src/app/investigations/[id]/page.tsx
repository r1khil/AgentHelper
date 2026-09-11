import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getInvestigation } from "@/lib/access";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/app/action-form";
import { StatusBadge, DeliveryBadge } from "@/components/app/status-badge";
import { RelativeMove } from "@/components/app/relative-move";
import { Timestamp } from "@/components/app/timestamp";
import { EmptyState } from "@/components/app/empty-state";
import { AlertIcon, ArrowOut } from "@/components/app/icons";
import {
  EvidenceFact,
  Hypothesis,
  OwnershipRegion,
} from "@/components/app/evidence";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { CheckboxField, Field, Input, Textarea } from "@/components/ui/field";

export default async function Investigation({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const a = await requireActor();

  let i;
  try {
    i = await getInvestigation(a, id);
  } catch {
    notFound();
  }

  const evidence = await db()`
    select f.*, s.title, s.published_at, s.retrieved_at
    from evidence_fact f
    join source s on s.id = f.source_id
    where f.investigation_id = ${id} and s.team_id = ${i.team_id}
    order by f.kind, f.id`;
  const notes = await db()`
    select n.*, u.name
    from analyst_note n
    join app_user u on u.id = n.author_id
    where n.investigation_id = ${id}
    order by n.created_at`;
  const feedback = await db()`
    select * from reasoning_feedback
    where investigation_id = ${id}
    order by created_at desc limit 3`;
  const deliveries = await db()`
    select * from delivery
    where investigation_id = ${id} and team_id = ${i.team_id}
    order by created_at`;
  const observations = await db()`
    select * from market_observation
    where id in (${i.holding_observation_id}, ${i.benchmark_observation_id})`;
  // docs/mvp.md:52 lists unresolved questions as a workspace element. They
  // lived only on the team page, where an analyst mid-investigation never
  // saw them.
  const [holding] = await db()`
    select questions, peers, prior_updates from holding where id = ${i.holding_id}`;

  const path = `/investigations/${id}`;
  const error = (await searchParams).error;
  const facts = evidence.filter((e) => e.kind === "fact");
  const hypotheses = evidence.filter((e) => e.kind === "hypothesis");
  const sources = new Map(evidence.map((e) => [e.source_id, e]));
  const done = i.status === "completed";

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow={`Closing movement · ${i.session}`}
        title={`${i.ticker}: investigate the move`}
        description="Start with what is known. Keep possible explanations open."
      >
        <StatusBadge status={i.status} />
      </PageHeader>

      {error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">Your last action failed</strong> —{" "}
            {error}
          </span>
        </Alert>
      )}
      {i.configuration_error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">Configuration</strong> —{" "}
            {i.configuration_error}
          </span>
        </Alert>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Metric label="Holding return" value={i.holding_return} unit="%" />
        <Metric label="SPX return" value={i.spx_return} unit="%" />
        <Metric label="Relative move" value={i.relative_move} unit="pp" lead />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-5">
          <OwnershipRegion
            owner="agent"
            title="The evidence"
            description="Sourced material gathered around the move. Every factual claim links to where it came from."
          >
            {facts.length ? (
              <div className="grid gap-4">
                {facts.map((e) => (
                  <EvidenceFact
                    key={e.id}
                    content={e.content}
                    title={e.title}
                    location={e.location}
                    sourceId={e.source_id}
                    publishedAt={e.published_at}
                    retrievedAt={e.retrieved_at}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No evidence yet">
                Collection status is visible in Administration. Absent evidence
                is explicit, not assumed.
              </EmptyState>
            )}

            {hypotheses.length > 0 && (
              <>
                <h3 className="mt-6 mb-2 font-serif text-base">
                  Possible explanations
                </h3>
                <div className="grid gap-3">
                  {hypotheses.map((e) => (
                    <Hypothesis
                      key={e.id}
                      content={e.content}
                      sourceId={e.source_id}
                    />
                  ))}
                </div>
              </>
            )}

            <p className="text-muted-foreground mt-5 mb-0 text-xs leading-relaxed">
              Evidence near a price move does not establish its cause. Missing
              transcripts, estimates, and constituent weights remain
              unavailable.
            </p>
          </OwnershipRegion>

          <OwnershipRegion
            owner="analyst"
            title="Your reasoning"
            description="Explain the evidence, consider alternatives, and connect it to your thesis. The agent will not write this for you."
          >
            {done ? (
              <>
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                  {i.analyst_update}
                </div>
                <p className="text-muted-foreground mt-3 mb-0 text-xs">
                  Completed <Timestamp value={i.completed_at} />
                </p>
              </>
            ) : (
              <ActionForm
                op="reasoning"
                id={id}
                returnTo={path}
                label="Save reasoning"
                pendingLabel="Saving…"
                buttonClassName={buttonVariants({ className: "justify-self-start" })}
                className="grid gap-3"
              >
                <Textarea
                  aria-label="Analyst reasoning"
                  name="reasoning"
                  rows={7}
                  defaultValue={i.analyst_update}
                  required
                  maxLength={10000}
                  placeholder="What do you think happened, and what supports that view?"
                />
                <CheckboxField>
                  <input
                    type="checkbox"
                    name="noCatalyst"
                    defaultChecked={i.no_catalyst}
                    className="mt-0.5"
                  />
                  <span>
                    No clear catalyst found
                    <span className="text-muted-foreground block text-xs">
                      A legitimate outcome. Do not manufacture an explanation.
                    </span>
                  </span>
                </CheckboxField>
              </ActionForm>
            )}

            <div className="border-border mt-5 border-t pt-5">
              <h3 className="mb-1 font-serif text-base">Learning prompts</h3>
              <p className="text-muted-foreground mt-0 mb-3 text-xs">
                The agent asks questions and flags gaps. It does not produce a
                replacement update.
              </p>
              <ActionForm
                op="review"
                id={id}
                returnTo={path}
                label="Get learning prompts"
                pendingLabel="Reviewing…"
                buttonClassName={buttonVariants({ variant: "outline" })}
              />
              {feedback.map((f) => (
                <div
                  key={f.id}
                  className="border-notice-border bg-notice-surface mt-3 rounded-md border px-4 py-3"
                >
                  <div className="text-notice mb-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
                    Reflection prompts · fixture
                  </div>
                  <ul className="mt-0 mb-2 grid list-disc gap-1 pl-4 text-[13px]">
                    {f.result.questions.map((q: string) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-0 mb-0 text-[11px]">
                    {f.result.limitations}
                  </p>
                </div>
              ))}
              <p className="text-muted-foreground mt-2 mb-0 text-[11px]">
                Scripted fixture feedback. No live analysis or claim
                verification.
              </p>
            </div>
          </OwnershipRegion>

          {holding?.questions?.trim() && (
            <OwnershipRegion
              owner="analyst"
              title="Open questions"
              description="Carried forward from your team's context for this holding."
            >
              <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                {holding.questions}
              </div>
              <Link
                href={`/teams/${i.team_id}`}
                className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                Edit in team context
                <ArrowOut className="size-3" />
              </Link>
            </OwnershipRegion>
          )}

          <OwnershipRegion
            owner="analyst"
            title="Research notes"
            description="Shared with your team."
          >
            {notes.length > 0 && (
              <div className="mb-5 grid gap-4">
                {notes.map((n) => (
                  <article key={n.id} className="border-border border-l-2 pl-4">
                    <div className="flex items-baseline gap-2">
                      <strong className="text-[13px]">{n.name}</strong>
                      <span className="text-muted-foreground text-[11px]">
                        <Timestamp value={n.created_at} />
                      </span>
                    </div>
                    <p className="mt-1 mb-0 text-[13px] leading-relaxed whitespace-pre-wrap">
                      {n.content}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <ActionForm
              op="note"
              id={id}
              returnTo={path}
              label="Add note"
              pendingLabel="Adding…"
              buttonClassName={buttonVariants({ variant: "outline", className: "justify-self-start" })}
              className="grid gap-3"
            >
              <Field>
                Team note
                <Textarea name="content" required maxLength={10000} rows={3} />
              </Field>
            </ActionForm>
          </OwnershipRegion>
        </div>

        <aside className="grid content-start gap-4">
          <Card className="p-4">
            <div className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-[0.14em] uppercase">
              Responsibility
            </div>
            <div
              className={`font-serif text-lg ${i.owner_name ? "" : "text-quality-fail"}`}
            >
              {i.owner_name ?? "No owner set"}
            </div>
            {!i.owner_name && (
              <p className="text-quality-fail mt-1 mb-0 text-xs">
                Responsibility falls back to the team lead until an owner is
                assigned.
              </p>
            )}
            <dl className="mt-3 grid gap-2 text-xs">
              <Row label="Update due">
                <Timestamp value={i.due_at} due={!done} absent="Not configured" />
              </Row>
              <Row label="Policy">{i.policy_version}</Row>
              <Row label="Trigger">
                |Holding return − SPX return| ≥ 4 pp
              </Row>
            </dl>
            <Link
              href={`/teams/${i.team_id}`}
              className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              Open team context
              <ArrowOut className="size-3" />
            </Link>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 font-serif text-base">Complete investigation</h3>
            {done ? (
              <>
                <StatusBadge status="completed" />
                <p className="text-muted-foreground mt-2 mb-0 text-xs">
                  Completed <Timestamp value={i.completed_at} />
                </p>
              </>
            ) : (
              <ActionForm
                op="complete"
                id={id}
                returnTo={path}
                label="Mark completed"
                pendingLabel="Completing…"
                buttonClassName={buttonVariants({ className: "mt-3 w-full" })}
                className="grid"
              >
                <p className="text-muted-foreground mt-0 mb-2 text-xs">
                  Completion requires your own update and the sources that
                  support it.
                </p>
                {sources.size ? (
                  [...sources.values()].map((s) => (
                    <CheckboxField key={s.source_id}>
                      <input
                        type="checkbox"
                        name="sourceId"
                        value={s.source_id}
                        className="mt-0.5"
                      />
                      <span className="text-xs">{s.title}</span>
                    </CheckboxField>
                  ))
                ) : (
                  <p className="text-muted-foreground mt-0 mb-0 text-xs">
                    No sources are attached yet.
                  </p>
                )}
              </ActionForm>
            )}
          </Card>

          <Disclosure summary="Calculation inputs">
            {observations.map((o) => (
              <dl key={o.id} className="mb-3 grid gap-1 text-xs last:mb-0">
                <div className="font-semibold">{o.security_id}</div>
                <div className="text-muted-foreground">
                  Close {o.value} · previous {o.previous_close}
                </div>
                <div className="text-muted-foreground">
                  <Timestamp value={o.observed_at} />
                </div>
                <div className="text-muted-foreground">
                  {o.provider} · {o.quality}
                </div>
                <div className="text-muted-foreground">{o.raw.basis}</div>
              </dl>
            ))}
          </Disclosure>

          <Disclosure summary={`Captured notifications (${deliveries.length})`}>
            {deliveries.length ? (
              deliveries.map((d) => (
                <article key={d.id} className="mb-3 last:mb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="mt-0 mb-0 text-xs font-semibold">
                      {d.subject}
                    </h4>
                    <DeliveryBadge status={d.status} />
                  </div>
                  <div className="text-muted-foreground mt-0.5 text-[11px]">
                    {d.recipients.join(", ")}
                  </div>
                  <p className="text-muted-foreground mt-1 mb-0 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {d.body}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-muted-foreground mt-0 mb-0 text-xs">
                Nothing captured yet.
              </p>
            )}
          </Disclosure>

          {done && (
            <Card className="p-4">
              <h3 className="mb-1 font-serif text-base">A quick reflection</h3>
              <p className="text-muted-foreground mt-0 mb-3 text-xs">
                Brief feedback after completion.
              </p>
              <ActionForm
                op="evaluate"
                id={id}
                returnTo={path}
                label="Save feedback"
                pendingLabel="Saving…"
                buttonClassName={buttonVariants({ className: "mt-3 w-full" })}
                className="grid gap-3"
              >
                <Field>
                  Preparation time (minutes)
                  <Input type="number" name="minutes" min={0} max={1440} required />
                </Field>
                <Field>
                  Source tracing (1–5)
                  <Input type="number" name="tracing" min={1} max={5} required />
                </Field>
                <Field>
                  Reasoning confidence (1–5)
                  <Input
                    type="number"
                    name="reasoningScore"
                    min={1}
                    max={5}
                    required
                  />
                </Field>
                <Field>
                  What helped or was missing?
                  <Textarea name="comment" maxLength={2000} rows={3} />
                </Field>
              </ActionForm>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  unit,
  lead,
}: {
  label: string;
  value: string | number;
  unit: string;
  lead?: boolean;
}) {
  return (
    <Card className={`px-4 py-3 ${lead ? "border-foreground/25" : ""}`}>
      <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <div className="mt-1 text-3xl">
        <RelativeMove value={value} unit={unit} />
      </div>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

/** Native <details>: no JavaScript, works unhydrated, accessible by default. */
function Disclosure({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="border-border bg-card group rounded-lg border">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold">
        {summary}
        <span className="text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="border-border border-t px-4 py-3">{children}</div>
    </details>
  );
}
