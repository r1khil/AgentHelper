import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { invite } from "../actions";
import {
  Shell,
  PageTitle,
  Action,
  ErrorNotice,
  Badge,
  Time,
} from "../components";
export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invitation?: string }>;
}) {
  const a = await requireActor();
  if (!a.admin) notFound();
  const query = await searchParams;
  const jobs = await db()`select * from job order by created_at desc limit 100`;
  const failures =
    await db()`select q.*,h.ticker from quality_failure q join holding h on h.id=q.holding_id order by q.created_at desc limit 50`;
  const audit =
    await db()`select * from audit_event order by created_at desc limit 50`;
  const teams = await db()`select * from team order by name`;
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow="OPERATIONS"
        title="Keep the workflow accountable."
        description="Inspect replay results, job failures, invitations, and the audit trail."
      />
      <ErrorNotice message={query.error} />
      <div className="notice">
        Development mode: synthetic observations, captured emails, and fixture
        feedback. No paid data or model integrations are enabled.
      </div>
      <div className="admin-actions">
        <Action op="replay" returnTo="/admin" label="Replay THC + DRAM" />
        <Action op="worker" returnTo="/admin" label="Process due jobs" />
      </div>
      <section className="panel form-panel">
        <h2>Invite a developer</h2>
        <form action={invite}>
          <div className="form-grid">
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <label>
              Team
              <select name="teamId">
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <select name="role">
                <option value="member">Member</option>
                <option value="lead">Team lead</option>
              </select>
            </label>
          </div>
          <button>Create one-time invitation</button>
        </form>
        {query.invitation && (
          <div className="notice">
            <p>
              Share privately. The recipient signs in, opens “Join a team,” and
              enters this code. Expires in seven days.
            </p>
            <code className="wrap">{query.invitation}</code>
          </div>
        )}
      </section>
      <h2>Data quality</h2>
      {!failures.length && <p>No data-quality failures recorded.</p>}
      {failures.map((f) => (
        <div className="notice" key={f.id}>
          {f.ticker} / {f.session}: {f.message}{" "}
          {f.resolved_at ? "(resolved)" : "(needs attention)"}
        </div>
      ))}
      <h2>Durable jobs</h2>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Scheduled · Eastern</th>
              <th>Error / action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.kind}</td>
                <td>
                  <Badge status={j.status} />
                </td>
                <td>{j.attempts}</td>
                <td>
                  <Time value={j.run_at} />
                </td>
                <td>
                  {j.last_error}
                  {j.status === "failed" && (
                    <Action
                      op="retry"
                      id={j.id}
                      returnTo="/admin"
                      label="Retry job"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Audit trail</h2>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Actor</th>
              <th>Time · Eastern</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id}>
                <td>{e.action}</td>
                <td>{e.actor_id ?? "System"}</td>
                <td>
                  <Time value={e.created_at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
