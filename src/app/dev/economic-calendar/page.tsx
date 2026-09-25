import { notFound } from "next/navigation";
import { EconomicCalendar } from "@/components/app/economic-calendar/calendar";
import { calendarWeek } from "@/lib/economic-calendar/dates";
import { bookExposure, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import { calendarPreviewEnabled } from "@/lib/economic-calendar/preview";
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

export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ live?: string; audience?: string }>;
}) {
  const query = await searchParams;
  const live = query.live === "1";
  if (!calendarPreviewEnabled()) notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <EconomicCalendar
        initialRange={calendarWeek()}
        preview={!live}
        livePreview={live}
        factorContext={Promise.resolve(previewFactorContext(query.audience))}
      />
    </main>
  );
}
