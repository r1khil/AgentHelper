import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { assertTeam } from "@/lib/access";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/app/action-form";
import { Timestamp } from "@/components/app/timestamp";
import { EmptyState } from "@/components/app/empty-state";
import { AlertIcon } from "@/components/app/icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export default async function Team({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const a = await requireActor();

  try {
    await assertTeam(a, id);
  } catch {
    notFound();
  }

  const [team] = await db()`select * from team where id = ${id}`;
  if (!team) notFound();

  const holdings = await db()`select * from holding where team_id = ${id} order by ticker`;
  const members = await db()`
    select u.id, u.name
    from membership m join app_user u on u.id = m.user_id
    where m.team_id = ${id}`;
  const theses = await db()`
    select t.*, u.name
    from thesis t
    join holding h on h.id = t.holding_id
    join app_user u on u.id = t.author_id
    where h.team_id = ${id}
    order by t.created_at desc`;

  const path = `/teams/${id}`;
  const error = (await searchParams).error;
  const gaps = holdings.filter((h) => !h.owner_id).length;

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Team workspace"
        title={team.name}
        description="Holdings, owners, theses, and the open questions behind your next investigation."
      />

      {error && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">Your last action failed</strong> —{" "}
            {error}
          </span>
        </Alert>
      )}

      {gaps > 0 && (
        <Alert variant="destructive" className="mb-4 flex items-center gap-2.5">
          <AlertIcon className="size-4" />
          <span>
            <strong className="font-semibold">
              {gaps} holding{gaps === 1 ? "" : "s"} without an owner
            </strong>{" "}
            — responsibility falls back to the team lead until this is set.
          </span>
        </Alert>
      )}

      {holdings.length ? (
        <div className="grid gap-4">
          {holdings.map((h) => {
            const own = theses.filter((t) => t.holding_id === h.id);
            const approved = own.find((t) => t.approved_at);
            const owner = members.find((m) => m.id === h.owner_id);

            return (
              <Card key={h.id} className="p-0">
                <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="font-serif text-xl leading-none">{h.ticker}</h2>
                    <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                      {h.kind}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Chip ok={!!h.owner_id}>
                      {owner ? owner.name : "No owner — lead fallback"}
                    </Chip>
                    <Chip ok={!!approved}>
                      {approved ? "Thesis approved" : "No approved thesis"}
                    </Chip>
                  </div>
                </header>

                <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
                  <Readout label="Open questions" value={h.questions} />
                  <Readout label="Peers / constituents" value={h.peers} />
                  <Readout
                    label="Prior updates and references"
                    value={h.prior_updates}
                    className="lg:col-span-2"
                  />
                </div>

                {/*
                  Editing is behind a disclosure. Every holding previously
                  rendered a full, always-open edit form, so a team page was a
                  stack of forms rather than a workspace you could read.
                */}
                <Disclosure summary="Edit holding context">
                  <ActionForm
                    op="holding"
                    id={h.id}
                    returnTo={path}
                    label="Save holding context"
                    pendingLabel="Saving…"
                    buttonClassName={buttonVariants({
                      className: "mt-1 justify-self-start",
                    })}
                    className="grid gap-3"
                  >
                    <input type="hidden" name="teamId" value={id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field>
                        Ticker
                        <Input name="ticker" defaultValue={h.ticker} required maxLength={12} />
                      </Field>
                      <Field>
                        Security type
                        <Select name="kind" defaultValue={h.kind}>
                          <option value="stock">Stock</option>
                          <option value="etf">ETF</option>
                        </Select>
                      </Field>
                      <Field>
                        Responsible owner
                        <Select name="ownerId" defaultValue={h.owner_id ?? ""}>
                          <option value="">Team lead fallback</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Field>
                      Peers / constituents
                      <Textarea name="peers" defaultValue={h.peers} maxLength={10000} rows={3} />
                    </Field>
                    <Field>
                      Prior updates and references
                      <Textarea
                        name="priorUpdates"
                        defaultValue={h.prior_updates}
                        maxLength={10000}
                        rows={3}
                      />
                    </Field>
                    <Field>
                      Open questions
                      <Textarea
                        name="questions"
                        defaultValue={h.questions}
                        maxLength={10000}
                        rows={3}
                      />
                    </Field>
                  </ActionForm>
                </Disclosure>

                <div className="border-border border-t px-5 py-4">
                  <h3 className="mb-3 font-serif text-base">Thesis history</h3>
                  {own.length ? (
                    <div className="mb-4 grid gap-3">
                      {own.map((t) => (
                        <article
                          key={t.id}
                          className="border-border border-l-2 pl-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip ok={!!t.approved_at}>
                              {t.approved_at ? "Approved" : "Proposed"}
                            </Chip>
                            <span className="text-muted-foreground text-[11px]">
                              {t.name} · <Timestamp value={t.created_at} />
                            </span>
                          </div>
                          <p className="mt-1.5 mb-0 text-[13px] leading-relaxed whitespace-pre-wrap">
                            {t.content}
                          </p>
                          {!t.approved_at && (
                            <ActionForm
                              op="approve"
                              id={t.id}
                              returnTo={path}
                              label="Approve this thesis"
                              pendingLabel="Approving…"
                              buttonClassName={buttonVariants({
                                variant: "outline",
                                size: "sm",
                                className: "mt-2",
                              })}
                            />
                          )}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-0 mb-4 text-xs">
                      No thesis recorded yet.
                    </p>
                  )}

                  <Disclosure summary="Propose a new thesis">
                    <ActionForm
                      op="thesis"
                      returnTo={path}
                      label="Propose thesis"
                      pendingLabel="Proposing…"
                      buttonClassName={buttonVariants({
                        className: "mt-1 justify-self-start",
                      })}
                      className="grid gap-3"
                    >
                      <input type="hidden" name="holdingId" value={h.id} />
                      <Field>
                        New thesis version
                        <Textarea
                          name="content"
                          required
                          maxLength={10000}
                          rows={4}
                          placeholder="Record your team's view and the evidence it depends on."
                        />
                      </Field>
                    </ActionForm>
                    <p className="text-muted-foreground mt-2 mb-0 text-xs">
                      A proposed thesis takes effect only once a lead approves it.
                    </p>
                  </Disclosure>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No holdings yet">
          Add a holding below to start tracking it.
        </EmptyState>
      )}

      <div className="mt-4">
        <Disclosure summary="Add a holding" standalone>
          <ActionForm
            op="holding"
            returnTo={path}
            label="Add synthetic holding"
            pendingLabel="Adding…"
            buttonClassName={buttonVariants({ className: "mt-1 justify-self-start" })}
            className="grid gap-3"
          >
            <input type="hidden" name="teamId" value={id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                Ticker
                <Input name="ticker" required maxLength={12} />
              </Field>
              <Field>
                Type
                <Select name="kind">
                  <option value="stock">Stock</option>
                  <option value="etf">ETF</option>
                </Select>
              </Field>
              <Field>
                Owner
                <Select name="ownerId">
                  <option value="">Team lead fallback</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </ActionForm>
          <p className="text-muted-foreground mt-2 mb-0 text-xs">
            Automatic fixture collection covers THC and DRAM only. Other
            holdings retain context but do not imply live coverage.
          </p>
        </Disclosure>
      </div>
    </AppShell>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
        ok
          ? "bg-status-completed-surface text-status-completed"
          : "bg-quality-fail-surface text-quality-fail"
      }`}
    >
      {children}
    </span>
  );
}

function Readout({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      {value?.trim() ? (
        <p className="mt-0 mb-0 text-[13px] leading-relaxed whitespace-pre-wrap">
          {value}
        </p>
      ) : (
        <p className="text-muted-foreground mt-0 mb-0 text-[13px] italic">
          Not recorded
        </p>
      )}
    </div>
  );
}

function Disclosure({
  summary,
  standalone,
  children,
}: {
  summary: string;
  standalone?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      className={`group ${standalone ? "border-border bg-card rounded-lg border" : "border-border border-t"}`}
    >
      <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 px-5 py-2.5 text-xs font-semibold transition-colors">
        <span className="transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="border-border border-t px-5 py-4">{children}</div>
    </details>
  );
}
