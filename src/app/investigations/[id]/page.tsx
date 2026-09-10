import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getInvestigation } from "@/lib/access";
import { db } from "@/db/client";
import {
  Shell,
  PageTitle,
  Action,
  ErrorNotice,
  Badge,
  Time,
  MoneyMove,
  Empty,
} from "../../components";
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
  const evidence =
    await db()`select f.*,s.title,s.published_at,s.retrieved_at from evidence_fact f join source s on s.id=f.source_id where f.investigation_id=${id} and s.team_id=${i.team_id} order by f.kind,f.id`;
  const notes =
    await db()`select n.*,u.name from analyst_note n join app_user u on u.id=n.author_id where n.investigation_id=${id} order by n.created_at`;
  const feedback =
    await db()`select * from reasoning_feedback where investigation_id=${id} order by created_at desc limit 3`;
  const deliveries =
    await db()`select * from delivery where investigation_id=${id} and team_id=${i.team_id} order by created_at`;
  const observations =
    await db()`select * from market_observation where id in (${i.holding_observation_id},${i.benchmark_observation_id})`;
  const path = `/investigations/${id}`;
  const sourceMap = new Map(evidence.map((e) => [e.source_id, e]));
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow={`CLOSING MOVEMENT / ${i.session}`}
        title={`${i.ticker}: investigate the move.`}
        description="Start with what is known. Keep possible explanations open."
      >
        <Badge status={i.status} />
      </PageTitle>
      <ErrorNotice message={(await searchParams).error} />
      {i.configuration_error && (
        <div className="notice error">{i.configuration_error}</div>
      )}
      <div className="metrics">
        <div>
          <span>HOLDING RETURN</span>
          <strong>
            <MoneyMove value={i.holding_return} />
            <em>%</em>
          </strong>
        </div>
        <div>
          <span>SPX RETURN</span>
          <strong>
            <MoneyMove value={i.spx_return} />
            <em>%</em>
          </strong>
        </div>
        <div>
          <span>RELATIVE MOVE</span>
          <strong>
            <MoneyMove value={i.relative_move} />
            <em>pp</em>
          </strong>
        </div>
      </div>
      <div className="investigation-grid">
        <div>
          <section className="panel form-panel">
            <div className="section-head">
              <h2>The evidence</h2>
              <span>SOURCED / SYNTHETIC</span>
            </div>
            {evidence
              .filter((e) => e.kind === "fact")
              .map((e) => (
                <article className="evidence" key={e.id}>
                  <span className="eyebrow">FACT</span>
                  <p>{e.content}</p>
                  <Link
                    className="source-link"
                    href={`/sources/${e.source_id}`}
                  >
                    {e.title} ↗
                  </Link>
                  <small>
                    {e.location} · Published <Time value={e.published_at} />
                    <br />
                    Retrieved <Time value={e.retrieved_at} />
                  </small>
                </article>
              ))}
            {!evidence.length && (
              <Empty>
                Evidence is not available yet. Collection status is visible in
                administration.
              </Empty>
            )}
            <h3>Possible explanations</h3>
            {evidence
              .filter((e) => e.kind === "hypothesis")
              .map((e) => (
                <article className="hypothesis" key={e.id}>
                  <span className="eyebrow">
                    HYPOTHESIS · NOT ESTABLISHED CAUSATION
                  </span>
                  <p>{e.content}</p>
                  <Link href={`/sources/${e.source_id}`}>Related source ↗</Link>
                </article>
              ))}
            <p className="muted">
              Evidence near a price move does not establish its cause. Missing
              transcripts, estimates, and constituent weights remain
              unavailable.
            </p>
          </section>
          <section className="panel form-panel">
            <h2>Your reasoning</h2>
            <p className="muted">
              Explain the evidence, consider alternatives, and connect it to
              your thesis.
            </p>
            {i.status === "completed" ? (
              <>
                <div className="preserve">{i.analyst_update}</div>
                <p>
                  Completed <Time value={i.completed_at} />
                </p>
              </>
            ) : (
              <Action
                op="reasoning"
                id={id}
                returnTo={path}
                label="Save reasoning"
              >
                <textarea
                  aria-label="Analyst reasoning"
                  name="reasoning"
                  rows={7}
                  defaultValue={i.analyst_update}
                  required
                  maxLength={10000}
                  placeholder="What do you think happened, and what supports that view?"
                />
                <label className="checkbox">
                  <input
                    type="checkbox"
                    name="noCatalyst"
                    defaultChecked={i.no_catalyst}
                  />{" "}
                  No clear catalyst found
                </label>
              </Action>
            )}
            <div className="divider" />
            <Action
              op="review"
              id={id}
              returnTo={path}
              label="Get learning prompts"
            />
            <p className="muted">
              Scripted fixture feedback. No live AI analysis or claim
              verification.
            </p>
            {feedback.map((f) => (
              <div className="feedback" key={f.id}>
                <span className="eyebrow">REFLECTION PROMPTS · FIXTURE</span>
                <ul>
                  {f.result.questions.map((q: string) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <small>{f.result.limitations}</small>
              </div>
            ))}
          </section>
          <section className="panel form-panel">
            <h2>Research notes</h2>
            {notes.map((n) => (
              <article className="note" key={n.id}>
                <strong>{n.name}</strong>
                <small>
                  <Time value={n.created_at} />
                </small>
                <p className="preserve">{n.content}</p>
              </article>
            ))}
            <Action op="note" id={id} returnTo={path} label="Add note">
              <label>
                Team note
                <textarea name="content" required maxLength={10000} />
              </label>
            </Action>
          </section>
        </div>
        <aside>
          <section className="panel form-panel">
            <span className="eyebrow">RESPONSIBILITY</span>
            <h3>{i.owner_name ?? "Owner missing"}</h3>
            <dl>
              <dt>Update due</dt>
              <dd>
                <Time value={i.due_at} />
              </dd>
              <dt>Policy</dt>
              <dd>{i.policy_version}</dd>
              <dt>Trigger</dt>
              <dd>|Holding return − SPX return| ≥ 4 pp</dd>
            </dl>
            <Link href={`/teams/${i.team_id}`} className="text-link">
              Open team context ↗
            </Link>
          </section>
          <section className="panel form-panel">
            <h3>Complete investigation</h3>
            {i.status === "completed" ? (
              <Badge status="completed" />
            ) : (
              <Action
                op="complete"
                id={id}
                returnTo={path}
                label="Mark completed"
              >
                <p>Save your own update and select its supporting sources.</p>
                {[...sourceMap.values()].map((s) => (
                  <label className="checkbox" key={s.source_id}>
                    <input
                      type="checkbox"
                      name="sourceId"
                      value={s.source_id}
                    />
                    {s.title}
                  </label>
                ))}
              </Action>
            )}
          </section>
          <details className="panel form-panel">
            <summary>Calculation inputs</summary>
            {observations.map((o) => (
              <dl key={o.id}>
                <dt>{o.security_id}</dt>
                <dd>
                  Close {o.value} / previous {o.previous_close}
                </dd>
                <dd>
                  <Time value={o.observed_at} />
                </dd>
                <dd>
                  {o.provider} · {o.quality}
                </dd>
                <dd>{o.raw.basis}</dd>
              </dl>
            ))}
          </details>
          <details className="panel form-panel">
            <summary>Captured notifications ({deliveries.length})</summary>
            {deliveries.map((d) => (
              <article key={d.id}>
                <h4>{d.subject}</h4>
                <small>{d.recipients.join(", ")}</small>
                <p className="preserve">{d.body}</p>
                <Badge status={d.status} />
              </article>
            ))}
          </details>
          {i.status === "completed" && (
            <section className="panel form-panel">
              <h3>A quick reflection</h3>
              <Action
                op="evaluate"
                id={id}
                returnTo={path}
                label="Save feedback"
              >
                <label>
                  Preparation time (minutes)
                  <input
                    type="number"
                    name="minutes"
                    min={0}
                    max={1440}
                    required
                  />
                </label>
                <label>
                  Source tracing (1–5)
                  <input
                    type="number"
                    name="tracing"
                    min={1}
                    max={5}
                    required
                  />
                </label>
                <label>
                  Reasoning confidence (1–5)
                  <input
                    type="number"
                    name="reasoningScore"
                    min={1}
                    max={5}
                    required
                  />
                </label>
                <label>
                  What helped or was missing?
                  <textarea name="comment" maxLength={2000} />
                </label>
              </Action>
            </section>
          )}
        </aside>
      </div>
    </Shell>
  );
}
