import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageTeam, isFundWide, requireOnboardedUser } from "@/lib/auth";
import { holdingHref } from "@/lib/scope";
import { agentConfigured } from "@/lib/agent/model";
import { latestBearCase } from "@/lib/screener/bear-case";
import { listFilingChanges } from "@/lib/screener/filing-changes/store";
import { listPitches } from "@/lib/screener/pitches";
import { loadReverseDcf } from "@/lib/screener/reverse-dcf";
import { latestTearSheets } from "@/lib/screener/tear-sheets";
import { loadValueTrapChecklist } from "@/lib/screener/value-trap";
import { listAccessibleTeams } from "@/lib/auth";
import { PageHead } from "@/components/app/page-head";
import { Tabs } from "@/components/app/tabs";
import { HoldingLogo } from "@/components/app/holding-logo";
import { BearCaseTab } from "@/components/app/screener/company/bear-case";
import { CompanyRail } from "@/components/app/screener/company/rail";
import { DcfTab } from "@/components/app/screener/company/dcf";
import { PitchTab } from "@/components/app/screener/company/pitch";
import { TearSheetTab } from "@/components/app/screener/company/tear-sheet";
import { ChangeRow } from "@/components/app/screener/changes-tab";
import { companyHref } from "@/components/app/screener/parts";
import { COMPANY_TABS, loadCompany, parseCompanyTab } from "./load";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${decodeURIComponent(ticker).toUpperCase()}, Screener` };
}

/**
 * One company in the Screener, held or not: Hoot's tear sheet (when it was a screen hit), what changed in its filings,
 * the growth its price implies (reverse DCF), the value-trap checklist and bear case, and the team's pitch with its
 * kill criteria. The rail has its screen figures and who holds or watches it.
 */
export default async function CompanyPage({ params, searchParams }: { params: Promise<{ ticker: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ ticker: raw }, { tab: tabParam }, user] = await Promise.all([params, searchParams, requireOnboardedUser()]);
  const c = await loadCompany(user, raw);
  if (!c) notFound();
  const tab = parseCompanyTab(tabParam, !!c.hit);
  const teams = await listAccessibleTeams(user);
  const manageable = teams.filter((t) => canManageTeam(user, t.id));
  const canAct = c.teamId ? canManageTeam(user, c.teamId) : isFundWide(user);
  const heldBy = c.held.find((h) => teams.some((t) => t.id === h.teamId));

  const tabs = COMPANY_TABS.map((t) => ({ key: t.key, label: t.label, href: companyHref(c.ticker, t.key === "sheet" && c.hit ? undefined : t.key), active: t.key === tab }));

  let body: React.ReactNode;
  if (tab === "sheet") {
    const sheet = (await latestTearSheets([c.ticker])).get(c.ticker) ?? null;
    body = <TearSheetTab ticker={c.ticker} hit={c.hit} sheet={sheet} canWrite={canAct && agentConfigured()} />;
  } else if (tab === "changes") {
    const changes = await listFilingChanges({ tickers: [c.ticker], limit: 60 }).catch(() => []);
    body = (
      <>
        {!c.cik && <p className="py-4 text-body text-muted-foreground">{c.ticker} isn&apos;t an SEC registrant, so there are no filings to compare.</p>}
        {c.cik && changes.length === 0 && (
          <p className="border-b py-4 text-body text-muted-foreground">
            {c.held.length || c.watched.length ? "No changes flagged yet. New 10-K, 10-Q and 8-K filings are read the evening they arrive." : `Filing changes cover holdings and watchlist names. Watch ${c.ticker} to have its filings read.`}
          </p>
        )}
        {changes.length > 0 && (
          <ul aria-label={`${c.ticker} filing changes`}>
            {changes.map((ch) => (
              <ChangeRow key={ch.id} c={ch} canMark={canAct} />
            ))}
          </ul>
        )}
      </>
    );
  } else if (tab === "dcf") {
    const dcf = c.cik ? await loadReverseDcf(c.ticker, c.cik).catch((e: unknown) => ({ status: "no_data" as const, reason: e instanceof Error ? e.message : "SEC data didn't load." })) : null;
    body = <DcfTab ticker={c.ticker} dcf={dcf} canSetRate={isFundWide(user)} />;
  } else if (tab === "bear") {
    const [checklist, bear] = await Promise.all([c.cik ? loadValueTrapChecklist(c.ticker, c.cik).catch(() => null) : Promise.resolve(null), latestBearCase(c.ticker)]);
    body = <BearCaseTab ticker={c.ticker} teamId={c.teamId} checklist={checklist} bear={bear} canRun={canAct && agentConfigured() && !!c.cik} canAnswer={canAct} />;
  } else {
    const pitches = await listPitches({ ticker: c.ticker, teamIds: teams.map((t) => t.id) });
    body = <PitchTab ticker={c.ticker} pitches={pitches} teams={manageable.map((t) => ({ id: t.id, name: t.name }))} defaultTeamId={c.teamId} teamName={Object.fromEntries(teams.map((t) => [t.id, t.name]))} />;
  }

  const sub = [c.hit ? `${c.hit.track === "garp" ? "GARP" : "Value"} track` : null, heldBy ? `held by ${heldBy.name}` : c.watched.length ? `watched by ${c.watched.map((w) => w.name).join(" and ")}` : null].filter(Boolean).join(", ");
  return (
    <>
      <PageHead
        crumbs={[{ label: "Screener", href: "/screener" }, { label: c.ticker }]}
        tabs={false}
        actions={
          heldBy ? (
            <Link href={holdingHref(null, heldBy.slug, c.ticker)} className="text-body font-semibold hover:underline">
              Open the holding
            </Link>
          ) : undefined
        }
      />
      <div className="flex gap-9">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <HoldingLogo ticker={c.ticker} size={40} />
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-display font-semibold tracking-[-0.01em]">{c.name}</h1>
              <span className="truncate text-body text-muted-foreground">
                {c.ticker}
                {sub ? `, ${sub}` : ""}
              </span>
            </div>
          </div>
          <Tabs label={`${c.ticker} in the Screener`} items={tabs} scroll={false} className="mt-[26px] gap-[22px]" />
          <div className="min-w-0 pt-5">{body}</div>
        </div>
        <CompanyRail c={c} manageable={manageable.map((t) => ({ id: t.id, name: t.name }))} />
      </div>
    </>
  );
}
