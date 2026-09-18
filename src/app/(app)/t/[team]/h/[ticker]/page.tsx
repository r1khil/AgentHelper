import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadTeam } from "@/lib/teams";
import { getHolding, listNotes, listPendingProposals, listTeamMembers } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { getDailyBars, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { listFilings } from "@/lib/providers/edgar";
import { finnhubConfigured, getCompanyNews } from "@/lib/providers/finnhub";
import { addNote, deleteNote, exitHolding, updateOwner, updateThesis } from "@/lib/actions/holdings";
import { canManageTeam } from "@/lib/auth";
import { DOC_KIND_LABELS, driveStatus, listHoldingFiles } from "@/lib/drive/index";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { DocumentSummary } from "@/components/app/document-summary";
import { ThesisProposal } from "@/components/app/thesis-proposal";
import { fmtDate, fmtMoney, relativeTime } from "@/lib/format";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { Move } from "@/components/app/move";
import { PriceChart, type ChartPoint } from "@/components/app/price-chart";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const MATERIAL_FORMS = ["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "6-K", "DEF 14A", "S-1", "424B4"];

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function HoldingPage({ params, searchParams }: { params: Promise<{ team: string; ticker: string }>; searchParams: Promise<{ error?: string }> }) {
  const { team: slug, ticker } = await params;
  const { error: flash } = await searchParams;
  const { team, user } = await loadTeam(slug);
  const row = await getHolding(team.id, ticker);
  if (!row) notFound();
  const { h, ownerName } = row;

  const { since, today } = newsWindow();
  const [members, notes, market, bars, spxBars, filings, news, drive, docs, proposals] = await Promise.all([
    listTeamMembers(team.id),
    listNotes(h.id),
    marketSnapshot([h.ticker]),
    getDailyBars(h.ticker, 90).catch(() => []),
    getDailyBars(SPX_SYMBOL, 90).catch(() => []),
    h.cik ? listFilings(h.cik, { forms: MATERIAL_FORMS, limit: 8 }).catch(() => []) : Promise.resolve([]),
    finnhubConfigured() ? getCompanyNews(h.ticker, since, today).catch(() => []) : Promise.resolve([]),
    driveStatus().catch(() => null),
    listHoldingFiles(h.id, 30).catch(() => []),
    listPendingProposals(h.id).catch(() => []),
  ]);
  const thesisProposal = !h.thesis?.trim() ? proposals.find((p) => p.field === "thesis") : undefined;
  const driveReady = Boolean(drive?.connected && drive.rootFolderId && !drive.needsReconnect);
  const driveNote = !drive?.configured ? "Google Drive is not set up on this deployment." : !drive.connected || !drive.rootFolderId ? "Ask an admin to connect Google Drive from the Admin page." : drive.needsReconnect ? "Google Drive needs to be reconnected by an admin." : undefined;

  const m = market.rows[h.ticker];
  const chart = rebase(bars, spxBars);
  const manage = canManageTeam(user, team.id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span>{h.ticker}</span>
            <span className="text-base font-normal text-muted-foreground">{h.companyName}</span>
            {h.status === "exited" && <Badge variant="secondary">Exited</Badge>}
          </span>
        }
        description={
          m?.quote ? (
            <span className="flex flex-wrap items-center gap-x-3">
              <span className="tnum text-foreground">{fmtMoney(m.quote.price)}</span>
              <Move value={m.quote.changePct} unit="%" digits={2} />
              <span>vs S&amp;P <Move value={m.relativePp} unit=" pp" /></span>
              <span className="text-xs">{relativeTime(m.quote.asOf)}</span>
            </span>
          ) : (
            market.error ?? "Quote unavailable"
          )
        }
        actions={
          manage && h.status === "active" ? (
            <form action={exitHolding}>
              <input type="hidden" name="holdingId" value={h.id} />
              <Button type="submit" variant="outline" size="sm">
                Mark exited
              </Button>
            </form>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <SectionTitle aside="Last 90 sessions">Price vs S&amp;P 500</SectionTitle>
            <PriceChart data={chart} ticker={h.ticker} />
          </Card>

          <Card className="p-4">
            <SectionTitle aside={h.thesisUpdatedAt ? `Updated ${relativeTime(h.thesisUpdatedAt)}` : undefined}>Thesis</SectionTitle>
            {flash && <p className="mb-2 text-sm text-destructive">{flash}</p>}
            {thesisProposal && <ThesisProposal proposal={thesisProposal} />}
            <form action={updateThesis} className="grid gap-2">
              <input type="hidden" name="holdingId" value={h.id} />
              <Textarea name="thesis" defaultValue={h.thesis ?? ""} rows={5} placeholder="The team's position, in its own words. The agent reads this for context but never edits it." />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="outline">
                  Save thesis
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4">
            <SectionTitle aside={`${notes.length}`}>Notes</SectionTitle>
            <form action={addNote} className="mb-4 grid gap-2">
              <input type="hidden" name="holdingId" value={h.id} />
              <Textarea name="body" rows={2} placeholder="Add a note for the team…" required />
              <div className="flex justify-end">
                <Button type="submit" size="sm">
                  Add note
                </Button>
              </div>
            </form>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="divide-y">
                {notes.map(({ n, authorName }) => (
                  <li key={n.id} className="py-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {authorName ?? "Unknown"} · {relativeTime(n.createdAt)}
                      </span>
                      {(n.authorId === user.id || manage) && (
                        <form action={deleteNote}>
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="hover:text-destructive">
                            Delete
                          </button>
                        </form>
                      )}
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <SectionTitle>Owner</SectionTitle>
            <form action={updateOwner} className="flex items-center gap-2">
              <input type="hidden" name="holdingId" value={h.id} />
              <NativeSelect name="ownerId" defaultValue={h.ownerId ?? ""} disabled={!manage && h.ownerId !== null && h.ownerId !== user.id}>
                <option value="">Unassigned</option>
                {members.map((mm) => (
                  <option key={mm.id} value={mm.id}>
                    {mm.fullName}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" variant="outline">
                Save
              </Button>
            </form>
            {!ownerName && <p className="mt-2 text-xs text-warning-foreground">No owner. Movement alerts fall back to the lead analyst.</p>}
          </Card>

          <Card className="p-4">
            <SectionTitle aside={driveReady ? `${docs.length} in the Fund's Drive` : undefined}>Documents</SectionTitle>
            {docs.length === 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">{driveReady ? "Nothing filed for this holding yet. The agent reads these documents for context." : "The agent reads the team's initiating report, earnings updates, and model from the Fund's Drive."}</p>
            ) : (
              <ul className="mb-3 space-y-2">
                {docs.map((d) => (
                  <li key={d.id} className="text-sm">
                    <div className="flex items-baseline gap-2">
                      <Badge variant="outline" className="w-28 shrink-0 justify-center text-[0.7rem]">
                        {d.kind ? DOC_KIND_LABELS[d.kind] : "Other"}
                      </Badge>
                      <a href={d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={d.path}>
                        {d.name}
                      </a>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">{d.modifiedTime ? relativeTime(d.modifiedTime) : ""}</span>
                    </div>
                    <div className="pl-30">
                      <DocumentSummary summary={d.summary} summaryError={d.summaryError} summaryModel={d.summaryModel} summarizedAt={d.summarizedAt} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {h.status === "active" && <DocumentUploadForm holdingId={h.id} disabledReason={driveNote} />}
          </Card>

          <Card className="p-4">
            <SectionTitle aside={h.cik ? `CIK ${Number(h.cik)}` : "No CIK"}>Recent filings</SectionTitle>
            {filings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{h.cik ? "No filings found." : "No SEC registrant matched this ticker."}</p>
            ) : (
              <ul className="space-y-2">
                {filings.map((f) => (
                  <li key={f.accession} className="flex items-baseline gap-2 text-sm">
                    <Badge variant="outline" className="tnum w-14 justify-center">{f.form}</Badge>
                    <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {f.description || f.primaryDocument}
                    </a>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{fmtDate(f.filedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle aside="Last 7 days">News</SectionTitle>
            {!finnhubConfigured() ? (
              <p className="text-sm text-muted-foreground">News needs a Finnhub key (FINNHUB_API_KEY).</p>
            ) : news.length === 0 ? (
              <p className="text-sm text-muted-foreground">No news in the window.</p>
            ) : (
              <ul className="space-y-2.5">
                {news.slice(0, 8).map((n) => (
                  <li key={n.id} className="text-sm">
                    <a href={n.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {n.headline}
                    </a>
                    <div className="text-xs text-muted-foreground">
                      {n.source} · {relativeTime(n.publishedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function newsWindow() {
  const now = Date.now();
  return { since: new Date(now - 7 * 86400000).toISOString().slice(0, 10), today: new Date(now).toISOString().slice(0, 10) };
}

function rebase(bars: { date: string; close: number }[], spx: { date: string; close: number }[]): ChartPoint[] {
  if (!bars.length || !spx.length) return [];
  const spxByDate = new Map(spx.map((b) => [b.date, b.close]));
  const points: ChartPoint[] = [];
  let h0: number | null = null;
  let s0: number | null = null;
  for (const b of bars) {
    const s = spxByDate.get(b.date);
    if (s === undefined) continue;
    h0 ??= b.close;
    s0 ??= s;
    points.push({ date: b.date, holding: 100 * (b.close / h0 - 1), spx: 100 * (s / s0 - 1) });
  }
  return points;
}
