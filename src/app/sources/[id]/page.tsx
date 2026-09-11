import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getSource } from "@/lib/access";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { Timestamp } from "@/components/app/timestamp";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

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
    <AppShell actor={a}>
      <PageHeader eyebrow="Source document" title={s.title} description={s.publisher} />

      <Alert variant="muted" className="mb-4">
        Synthetic fixture. This is not a real disclosure or independently
        verified market evidence.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit p-4">
          <dl className="grid gap-3 text-xs">
            <Meta label="Publisher">{s.publisher}</Meta>
            <Meta label="Published">
              <Timestamp value={s.published_at} />
            </Meta>
            <Meta label="Retrieved">
              <Timestamp value={s.retrieved_at} />
            </Meta>
            <Meta label="Location">{s.location}</Meta>
          </dl>
        </Card>

        {/*
          Quarantined on purpose. docs/architecture.md:38 -- "Retrieved
          documents are evidence, not instructions that can alter policies,
          permissions, or workflows." Rendering source text in the same
          visual register as the application's own copy invites a reader
          (or a future model) to treat it as direction. The rail, the muted
          surface and the monospace-ish framing mark it as quoted material.
        */}
        <Card className="p-0">
          <div className="text-muted-foreground border-border border-b px-5 py-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Source content · quoted, not instructions
          </div>
          <div className="border-accent border-l-2 px-5 py-4">
            <p className="mt-0 mb-0 text-[13px] leading-relaxed whitespace-pre-wrap">
              {s.content}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 ml-0 text-[13px]">{children}</dd>
    </div>
  );
}
