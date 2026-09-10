import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getSource } from "@/lib/access";
import { Shell, PageTitle, Time } from "../../components";
export default async function Source({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await requireActor();
  let s;
  try {
    s = await getSource(a, (await params).id);
  } catch {
    notFound();
  }
  return (
    <Shell actor={a}>
      <PageTitle
        eyebrow="SOURCE DOCUMENT"
        title={s.title}
        description={s.publisher}
      />
      <div className="notice">
        Synthetic fixture. This is not a real disclosure or independently
        verified market evidence.
      </div>
      <div className="panel form-panel">
        <dl>
          <dt>Published</dt>
          <dd>
            <Time value={s.published_at} />
          </dd>
          <dt>Retrieved</dt>
          <dd>
            <Time value={s.retrieved_at} />
          </dd>
          <dt>Source location</dt>
          <dd>{s.location}</dd>
        </dl>
        <div className="divider" />
        <p className="preserve">{s.content}</p>
      </div>
    </Shell>
  );
}
