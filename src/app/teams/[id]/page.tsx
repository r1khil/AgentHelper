import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { assertTeam } from "@/lib/access";
import { db } from "@/db/client";
import { Shell, PageTitle, Action, ErrorNotice } from "../../components";
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
  const [team] = await db()`select * from team where id=${id}`;
  if (!team) notFound();
  const holdings =
    await db()`select * from holding where team_id=${id} order by ticker`;
  const members =
    await db()`select u.id,u.name from membership m join app_user u on u.id=m.user_id where m.team_id=${id}`;
  const theses =
    await db()`select t.*,u.name from thesis t join holding h on h.id=t.holding_id join app_user u on u.id=t.author_id where h.team_id=${id} order by t.created_at desc`;
  const path = `/teams/${id}`;
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow="TEAM WORKSPACE"
        title={team.name}
        description="Holdings, questions, and the context behind your next investigation."
      >
        <Link className="text-link" href="/">
          ← Overview
        </Link>
      </PageTitle>
      <ErrorNotice message={(await searchParams).error} />
      {holdings.map((h) => (
        <section className="panel holding-panel" key={h.id}>
          <div className="section-head">
            <h2>
              {h.ticker} <small>{h.kind.toUpperCase()}</small>
            </h2>
            <span>
              {!h.owner_id
                ? "Ownership needs attention"
                : !theses.some((t) => t.holding_id === h.id && t.approved_at)
                  ? "Approved thesis missing"
                  : "Context recorded"}
            </span>
          </div>
          <Action
            op="holding"
            id={h.id}
            returnTo={path}
            label="Save holding context"
          >
            <input type="hidden" name="teamId" value={id} />
            <div className="form-grid">
              <label>
                Ticker
                <input
                  name="ticker"
                  defaultValue={h.ticker}
                  required
                  maxLength={12}
                />
              </label>
              <label>
                Security type
                <select name="kind" defaultValue={h.kind}>
                  <option value="stock">Stock</option>
                  <option value="etf">ETF</option>
                </select>
              </label>
              <label>
                Responsible owner
                <select name="ownerId" defaultValue={h.owner_id ?? ""}>
                  <option value="">Team lead fallback</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Peers / constituents
              <textarea name="peers" defaultValue={h.peers} maxLength={10000} />
            </label>
            <label>
              Prior updates and references
              <textarea
                name="priorUpdates"
                defaultValue={h.prior_updates}
                maxLength={10000}
              />
            </label>
            <label>
              Open questions
              <textarea
                name="questions"
                defaultValue={h.questions}
                maxLength={10000}
              />
            </label>
          </Action>
          <div className="divider" />
          <h3>Thesis history</h3>
          {theses
            .filter((t) => t.holding_id === h.id)
            .map((t) => (
              <div className="thesis" key={t.id}>
                <span className="eyebrow">
                  {t.approved_at ? "APPROVED" : "PROPOSED"} · {t.name}
                </span>
                <p className="preserve">{t.content}</p>
                {!t.approved_at && (
                  <Action
                    op="approve"
                    id={t.id}
                    returnTo={path}
                    label="Approve this thesis"
                  />
                )}
              </div>
            ))}
          <Action op="thesis" returnTo={path} label="Propose thesis">
            <input type="hidden" name="holdingId" value={h.id} />
            <label>
              New thesis version
              <textarea
                name="content"
                required
                maxLength={10000}
                placeholder="Record your team's view and the evidence it depends on."
              />
            </label>
          </Action>
        </section>
      ))}
      <details className="panel form-panel">
        <summary>Add a holding</summary>
        <Action op="holding" returnTo={path} label="Add synthetic holding">
          <input type="hidden" name="teamId" value={id} />
          <label>
            Ticker
            <input name="ticker" required maxLength={12} />
          </label>
          <label>
            Type
            <select name="kind">
              <option value="stock">Stock</option>
              <option value="etf">ETF</option>
            </select>
          </label>
          <label>
            Owner
            <select name="ownerId">
              <option value="">Team lead fallback</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </Action>
        <p>
          Automatic fixture collection is available for THC and DRAM only. Other
          holdings retain context but do not imply live coverage.
        </p>
      </details>
    </Shell>
  );
}
