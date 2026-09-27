import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { composeWeeklyEmail, weeklyEmailRecipients } from "@/lib/weekly/email";
import { getPack, normalizeAgenda, packFigures } from "@/lib/weekly/store";
import { agendaWeek, isFriday, packTitle } from "@/lib/weekly/weeks";
import { WeeklyPack, type EmailView } from "@/components/app/weekly/weekly-pack";

export const metadata: Metadata = { title: "Weekly update" };
export const maxDuration = 300;

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${tone === "ok" ? "border-up/30 bg-up/5" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{children}</div>
  );
}

export default async function WeeklyPackPage({ params, searchParams }: PageProps<"/weekly/[week]">) {
  await requireRole("exec", "admin");
  const { week } = await params;
  // Packs are keyed by the Friday the week ended on; anything else is not a pack.
  if (!isFriday(week)) notFound();
  const { ok, error } = await searchParams;
  const pack = await getPack(week);
  let email: EmailView | null = null;
  if (pack) {
    const recipients = await weeklyEmailRecipients();
    const draft = await composeWeeklyEmail(week, recipients.to);
    if (draft) email = { ...recipients, ...draft, record: pack.sources?.email ?? null };
  }

  return (
    <>
      <Link className="text-sm underline" href="/weekly">
        ← All weekly packs
      </Link>
      <div className="mt-4">
        {ok && <Notice tone="ok">{ok}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!pack ? (
          <div className="rounded-lg border border-dashed px-6 py-10 text-center">
            <div className="text-sm font-medium">{packTitle(week)}</div>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              This pack has not been built. Build it from the <Link className="underline" href="/weekly">Weekly update</Link> page.
            </p>
          </div>
        ) : (
          <WeeklyPack
            weekEnding={week}
            agendaRange={agendaWeek(week)}
            status={pack.status}
            figures={packFigures(pack)}
            performers={pack.performers}
            agenda={normalizeAgenda(pack.agenda)}
            lastWeekAgenda={normalizeAgenda(pack.lastWeekAgenda)}
            sources={pack.sources ?? {}}
            email={email}
            builtAt={pack.builtAt?.toISOString() ?? null}
            editedAt={pack.editedAt?.toISOString() ?? null}
            sentAt={pack.sentAt?.toISOString() ?? null}
          />
        )}
      </div>
    </>
  );
}
