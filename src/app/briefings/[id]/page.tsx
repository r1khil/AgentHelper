import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { assertTeam } from "@/lib/access";
import { db } from "@/db/client";
import { Shell, PageTitle, MoneyMove } from "../../components";
export default async function Briefing({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await requireActor();
  const [b] =
    await db()`select b.*,t.name from briefing b join team t on t.id=b.team_id where b.id=${(await params).id}`;
  if (!b) notFound();
  try {
    await assertTeam(a, b.team_id);
  } catch {
    notFound();
  }
  const sources = b.source_ids.length
    ? await db()`select * from source where id in ${db()(b.source_ids)} and team_id=${b.team_id}`
    : [];
  const events = b.event_ids.length
    ? await db()`select e.*,h.ticker,i.id as investigation_id from movement_event e join holding h on h.id=e.holding_id join investigation i on i.event_id=e.id where e.id in ${db()(b.event_ids)} and e.team_id=${b.team_id}`
    : [];
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow={`${b.name} / ${b.day}`}
        title="The evidence briefing."
        description="New material to review, with its sources intact."
      />
      <div className="notice">
        Synthetic development briefing. No investment conclusion is generated.
      </div>
      <div className="panel form-panel">
        <h2>Movements to investigate</h2>
        {events.map((e) => (
          <p key={e.id}>
            <Link href={`/investigations/${e.investigation_id}`}>
              {e.ticker} ↗
            </Link>{" "}
            · <MoneyMove value={e.relative_move} /> pp versus SPX
          </p>
        ))}
        <h2>New source material</h2>
        {sources.map((s) => (
          <div key={s.id} className="evidence">
            <Link href={`/sources/${s.id}`}>{s.title} ↗</Link>
            <p>
              {s.location} · {s.publisher}
            </p>
          </div>
        ))}
      </div>
    </Shell>
  );
}
