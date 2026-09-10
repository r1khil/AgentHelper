import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { Shell, PageTitle, Badge, Time, Empty, MoneyMove } from "./components";
export const dynamic = "force-dynamic";
export default async function Home() {
  const a = await requireActor();
  const sql = db();
  const teams =
    await sql`select t.*,count(distinct h.id)::int as holdings,count(distinct i.id) filter(where i.status<>'completed')::int as open from team t left join holding h on h.team_id=t.id left join investigation i on i.team_id=t.id where (${a.admin} or exists(select 1 from membership m where m.team_id=t.id and m.user_id=${a.id})) group by t.id order by t.name`;
  const investigations =
    await sql`select i.*,h.ticker,e.relative_move,t.name as team_name,u.name as owner_name from investigation i join movement_event e on e.id=i.event_id join holding h on h.id=e.holding_id join team t on t.id=i.team_id left join app_user u on u.id=i.owner_id where (${a.admin} or exists(select 1 from membership m where m.team_id=i.team_id and m.user_id=${a.id})) order by i.created_at desc limit 30`;
  const briefings =
    await sql`select b.*,t.name from briefing b join team t on t.id=b.team_id where (${a.admin} or exists(select 1 from membership m where m.team_id=b.team_id and m.user_id=${a.id})) order by b.day desc limit 6`;
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow="THE RESEARCH DESK"
        title="A clearer starting point."
        description="Follow the evidence. Investigate the move. Build your own view."
      />
      <div className="metrics">
        <div>
          <span>TEAM WORKSPACES</span>
          <strong>{teams.length.toString().padStart(2, "0")}</strong>
          <small>Your research communities</small>
        </div>
        <div>
          <span>OPEN INVESTIGATIONS</span>
          <strong>
            {investigations
              .filter((i) => i.status !== "completed")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>Waiting for analyst judgment</small>
        </div>
        <div>
          <span>MOVEMENT THRESHOLD</span>
          <strong>
            ±4.0 <em>pp</em>
          </strong>
          <small>Closing return relative to SPX</small>
        </div>
      </div>
      <div className="section-head">
        <h2>Your teams</h2>
        <span>Shared context. Distinct perspectives.</span>
      </div>
      <div className="team-grid">
        {teams.map((t, index) => (
          <Link href={`/teams/${t.id}`} className="team-card" key={t.id}>
            <span className="card-number">0{index + 1} / SECTOR</span>
            <h3>
              {t.name} <span>↗</span>
            </h3>
            <p>
              {t.holdings} holdings <span>·</span> {t.open} open investigations
            </p>
            <div className="card-line" />
          </Link>
        ))}
      </div>
      {!teams.length && (
        <Empty>
          No team membership yet.{" "}
          <Link href="/join">Accept your invitation</Link>.
        </Empty>
      )}
      <div className="section-head">
        <h2>Movement investigations</h2>
        <span>OFFICIAL CLOSE · SYNTHETIC DATA</span>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Holding / team</th>
              <th>Relative move</th>
              <th>Owner</th>
              <th>Due · Eastern</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {investigations.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.ticker}</strong>
                  <small>{i.team_name}</small>
                </td>
                <td className="move">
                  <MoneyMove value={i.relative_move} /> <small>pp vs SPX</small>
                </td>
                <td>{i.owner_name ?? "Owner missing"}</td>
                <td>
                  <Time value={i.due_at} />
                </td>
                <td>
                  <Badge status={i.status} />
                </td>
                <td>
                  <Link className="text-link" href={`/investigations/${i.id}`}>
                    Investigate ↗
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!investigations.length && (
          <Empty>
            No investigations yet. An administrator can run the synthetic
            replay.
          </Empty>
        )}
      </div>
      <div className="section-head">
        <h2>Daily briefings</h2>
        <span>Only when there is something to review</span>
      </div>
      <div className="briefing-grid">
        {briefings.map((b) => (
          <Link
            className="panel briefing-card"
            href={`/briefings/${b.id}`}
            key={b.id}
          >
            <span className="eyebrow">
              {b.name} / {b.day}
            </span>
            <h3>The evidence briefing ↗</h3>
            <p>
              {b.source_ids.length} sources · {b.event_ids.length} movements
            </p>
          </Link>
        ))}
      </div>
      {!briefings.length && (
        <Empty>
          No material briefing is available. Empty briefings are suppressed.
        </Empty>
      )}
    </Shell>
  );
}
