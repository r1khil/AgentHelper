import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { getModel, listMappings, listModelVersions, listProposals } from "@/lib/models";
import { approveAllProposed, deleteMapping, generateProposals, reviewProposal, writeApproved } from "@/lib/actions/models";
import { fmtDate, relativeTime } from "@/lib/format";
import type { WorkbookInfo } from "@/lib/excel/read";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { MappingEditor } from "@/components/app/models/mapping-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Model" };

export default async function ModelPage({ params, searchParams }: { params: Promise<{ team: string; modelId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { team: slug, modelId } = await params;
  const { ok, error } = await searchParams;
  const { team } = await loadTeam(slug);
  const row = await getModel(modelId);
  if (!row || row.h.teamId !== team.id) notFound();
  const { m, h } = row;
  const [mappings, proposals, versions] = await Promise.all([listMappings(m.id), listProposals(m.id), listModelVersions(h.id)]);
  const workbook = { sheets: (m.sheets as WorkbookInfo["sheets"]) ?? [] };
  const counts = { proposed: 0, approved: 0, rejected: 0, exception: 0 };
  for (const p of proposals) counts[p.p.status]++;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Button nativeButton={false} render={<Link href={`/t/${team.slug}/models`} />} variant="ghost" size="sm">
          <ArrowLeft />
          Models
        </Button>
        <Button nativeButton={false} render={<a href={`/api/models/${m.id}/download`} />} variant="outline" size="sm">
          <Download />
          Download v{m.version}
        </Button>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Link href={`/t/${team.slug}/h/${h.ticker}`} className="hover:underline">{h.ticker}</Link>
            <span className="text-base font-normal text-muted-foreground">{m.fileName}</span>
            <Badge variant="outline">v{m.version}</Badge>
          </span>
        }
        description={
          <span>
            {versions.length > 1 && (
              <>
                Versions:{" "}
                {versions.map((v, i) => (
                  <span key={v.id}>
                    {i > 0 && " · "}
                    {v.id === m.id ? <strong>v{v.version}</strong> : <Link href={`/t/${team.slug}/models/${v.id}`} className="hover:underline">v{v.version}</Link>}
                  </span>
                ))}
                .{" "}
              </>
            )}
            {h.cik ? `SEC CIK ${Number(h.cik)}.` : "No SEC registrant: XBRL proposals unavailable."}
          </span>
        }
      />
      {ok && <div className="mb-4 rounded-md border border-up/30 bg-up/5 px-3 py-2 text-sm">{ok}</div>}
      {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

      <SectionTitle aside={`${mappings.length} mapped line item${mappings.length === 1 ? "" : "s"}`}>1. Map a line item</SectionTitle>
      <MappingEditor modelId={m.id} workbook={workbook} existing={mappings.map((mm) => ({ sheet: mm.sheet, rowRef: mm.rowRef }))} />

      {mappings.length > 0 && (
        <>
          <SectionTitle>Mappings</SectionTitle>
          <Card className="mb-6 overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model line</TableHead>
                  <TableHead>Concept</TableHead>
                  <TableHead>Unit · scale</TableHead>
                  <TableHead>Periods</TableHead>
                  <TableHead>Rationale</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mm) => (
                  <TableRow key={mm.id}>
                    <TableCell>
                      <div className="font-medium">{mm.labelInModel}</div>
                      <div className="text-xs text-muted-foreground">{mm.sheet}!row {mm.rowRef}</div>
                    </TableCell>
                    <TableCell className="text-xs"><code>{mm.concept}</code></TableCell>
                    <TableCell className="text-xs">{mm.unit} · ÷{mm.scale.toLocaleString()}{mm.sign === -1 ? " · sign flipped" : ""} · {mm.periodType}</TableCell>
                    <TableCell className="text-xs">{Object.entries(mm.periodColumns).sort((a, b) => (a[1] < b[1] ? -1 : 1)).map(([c, d]) => `${c}=${d}`).join(", ")}</TableCell>
                    <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={mm.rationale ?? ""}>{mm.rationale}</TableCell>
                    <TableCell className="text-right">
                      <form action={deleteMapping}>
                        <input type="hidden" name="id" value={mm.id} />
                        <Button type="submit" size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive">Remove</Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">2. Review proposals <span className="text-muted-foreground">{counts.proposed} open · {counts.approved} approved · {counts.exception} exceptions · {counts.rejected} rejected</span></h2>
            <div className="flex gap-2">
              <form action={generateProposals}>
                <input type="hidden" name="modelId" value={m.id} />
                <Button type="submit" size="sm" variant="outline" disabled={!h.cik}>{proposals.length ? "Regenerate open" : "Generate proposals"}</Button>
              </form>
              {counts.proposed > 0 && (
                <form action={approveAllProposed}>
                  <input type="hidden" name="modelId" value={m.id} />
                  <Button type="submit" size="sm" variant="outline">Approve all open</Button>
                </form>
              )}
              {counts.approved > 0 && (
                <form action={writeApproved}>
                  <input type="hidden" name="modelId" value={m.id} />
                  <Button type="submit" size="sm">Write {counts.approved} approved → new version</Button>
                </form>
              )}
            </div>
          </div>
          <Card className="mb-6 overflow-x-auto p-0">
            {proposals.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Generate proposals to fill the other mapped periods from SEC XBRL facts. Each proposal carries its period, unit, reported label, filing, and derivation.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead>
                    <TableHead>Cell</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Value (model units)</TableHead>
                    <TableHead>Reported as</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map(({ p, mapping }) => (
                    <TableRow key={p.id} className={p.status === "exception" ? "bg-warning/5" : p.status === "rejected" ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{mapping.labelInModel}</TableCell>
                      <TableCell className="tnum text-xs">{mapping.sheet}!{p.cellRef}</TableCell>
                      <TableCell className="tnum text-xs">{fmtDate(p.periodEnd)}{p.fiscalPeriod ? <span className="block text-muted-foreground" title="Fiscal year and period as tagged in the source filing; comparatives carry the filing's tag, not the period's">tagged {p.fiscalPeriod}</span> : null}</TableCell>
                      <TableCell className="tnum text-right">{p.value !== null ? Number(p.value).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}</TableCell>
                      <TableCell className="max-w-56 text-xs">
                        <div className="truncate" title={p.reportedLabel ?? ""}>{p.reportedLabel}</div>
                        {p.derivation && <div className="text-warning-foreground" title={p.derivation}>derived, see note</div>}
                        {p.exceptionReason && <div className="text-warning-foreground">{p.exceptionReason}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.accession?.slice(-6) ?? "filing"} · {p.filedAt}</a> : "—"}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {p.status !== "approved" && p.value !== null && (
                          <form action={reviewProposal} className="inline">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <Button type="submit" size="xs" variant="ghost">Approve</Button>
                          </form>
                        )}
                        {p.status !== "rejected" && (
                          <form action={reviewProposal} className="inline">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <Button type="submit" size="xs" variant="ghost" className="text-muted-foreground">Reject</Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-muted-foreground">Writing creates a new file version; the previous version stays downloadable. Uploaded {relativeTime(m.createdAt)}.</p>
        </>
      )}
    </>
  );
}
