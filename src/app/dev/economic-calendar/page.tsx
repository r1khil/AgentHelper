import { notFound } from "next/navigation";
import { MarketsView } from "@/app/(app)/markets/markets-view";
import { parseMarketsQuery } from "@/app/(app)/markets/types";
import { bookExposure, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import { calendarPreviewEnabled } from "@/lib/economic-calendar/preview";
import { todayNY } from "@/lib/providers/calendar";
import { isFactorReport } from "@/lib/risk/factors";
import { previewReport } from "@/lib/risk/preview";

export const dynamic = "force-dynamic";

/** Synthetic factor betas for the release lines: ?audience=fund (default), team or label. */
function previewFactorContext(audience: string | undefined): CalendarFactorContext {
  if (audience === "label") return { audience: "label", exposure: null, href: null, basis: null };
  const team = audience === "team";
  const f = previewReport("1y", { team }).factors;
  if (!isFactorReport(f)) return { audience: team ? "team" : "fund", exposure: null, href: null, basis: null };
  return {
    audience: team ? "team" : "fund",
    exposure: bookExposure(team ? "the Tech & media book" : "the book", f.fund),
    href: team ? "/dev/exposure?scope=team#factors" : "/dev/exposure#factors",
    basis: `1 year of synthetic daily returns to ${f.sample.to}`,
  };
}

/**
 * Markets' economic releases without signing in, on synthetic data (or the live feed with ?live=1), and no earnings.
 * `?view=past&to=` looks back, as on /markets.
 */
export default async function Preview({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!calendarPreviewEnabled()) notFound();
  const sp = await searchParams;
  const live = sp.live === "1";
  const audience = typeof sp.audience === "string" ? sp.audience : undefined;
  return (
    <main className="app-container flex min-h-dvh flex-col bg-background">
      <MarketsView
        base="/dev/economic-calendar"
        query={parseMarketsQuery(sp)}
        scopeSlug={null}
        teamSlug={null}
        today={todayNY()}
        events={[]}
        accessibleTeamIds={[]}
        reports={[]}
        showTeam={false}
        team={null}
        teams={[]}
        notices={[]}
        factorContext={Promise.resolve(previewFactorContext(audience))}
        feedSource={live ? { livePreview: true } : { preview: true }}
        askable={false}
        banner={
          live ? (
            <p role="note" className="mt-2 text-caption text-muted-foreground">
              Local verification view with the live calendar feed. App sign-in is still required on /markets.
            </p>
          ) : (
            <p role="note" className="mt-2 text-body text-caution-foreground">
              <strong className="font-semibold">Development preview, synthetic data.</strong> Dates and values illustrate the interface, not the real economic schedule. Live coverage is not verified.
            </p>
          )
        }
      />
    </main>
  );
}
