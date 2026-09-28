import Link from "next/link";
import { Download, FileDown } from "lucide-react";
import { approveAllProposed, deleteMapping, generateProposals, writeApproved } from "@/lib/actions/models";
import { fmtDate, fmtDay, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountChip, Panel, PanelFooter, PanelHeader } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MappingEditor } from "./mapping-editor";
import { UploadModelDialog } from "./upload-model-dialog";
import { DecisionButtons, ExceptionDecide, RejectAllButton } from "./review-controls";
import { exceptionKind } from "./exception-kind";
import type { ModelDetailData, ModelListItem, ModelProposalRow, ModelTab, UploadTarget } from "./types";

/**
 * Models as master–detail: holdings and their latest model on the left, the selected model's proposals on the
 * right. Rendered by both /models (first model with proposals waiting selected) and /models/[modelId].
 */
export function ModelsView({
  items,
  uploadTargets,
  selected,
  selectedHoldingId,
  error,
}: {
  items: ModelListItem[];
  uploadTargets: UploadTarget[];
  selected: ModelDetailData | null;
  selectedHoldingId: string | null;
  /** A list-level error (e.g. from an upload) when no model is selected to show it. */
  error?: string | null;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <ModelList items={items} uploadTargets={uploadTargets} selectedHoldingId={selectedHoldingId} />
      {selected ? (
        <ModelDetail d={selected} uploadTargets={uploadTargets} />
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {error && <Banner tone="error">{error}</Banner>}
          <p className="py-2.5 text-sm text-muted-foreground">
            Select a model to review its proposed values. Nothing is waiting for review right now.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- left column ----

function ModelList({ items, uploadTargets, selectedHoldingId }: { items: ModelListItem[]; uploadTargets: UploadTarget[]; selectedHoldingId: string | null }) {
  const withModel = items.filter((i) => i.model);
  const without = items.filter((i) => !i.model);
  return (
    <Panel className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)]">
      <PanelHeader title="Models" className="px-3.5" aside={<UploadModelDialog targets={uploadTargets} defaultHoldingId={selectedHoldingId} />} />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {withModel.map((i) => {
          const m = i.model!;
          const on = i.holdingId === selectedHoldingId;
          const summary = modelSummary(m);
          return (
            <li key={i.holdingId}>
              <Link
                href={m.href}
                aria-current={on ? "page" : undefined}
                title={`${i.companyName} · v${m.version} · ${m.versions} version${m.versions === 1 ? "" : "s"}`}
                className={cn(
                  "block border-b border-row px-3.5 py-2.5 transition-colors hover:bg-band focus-visible:bg-band focus-visible:outline-none",
                  on && "bg-band shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="w-11 shrink-0 font-mono text-[13px] font-semibold">{i.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{m.fileName}</span>
                  {m.proposed > 0 ? <CountChip hot>{m.proposed}</CountChip> : <span className="px-[7px] font-mono text-[11px] text-muted-foreground">–</span>}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[i.teamName, m.uploader ?? "Unknown uploader"].filter(Boolean).join(" · ")} ·{" "}
                  <span className={cn(summary.warn && "text-caution-foreground")}>{summary.text}</span> · {shortDate(m.createdAt)}
                </div>
              </Link>
            </li>
          );
        })}
        {without.length > 0 && (
          <>
            <li className="flex h-9 items-center border-b border-row bg-band px-3.5 text-[12.5px] font-medium text-muted-foreground">
              No model yet <span className="ml-2 font-mono text-[11px]">{without.length}</span>
            </li>
            {without.map((i) => (
              <li key={i.holdingId} className="flex items-center gap-2 border-b border-row px-3.5 py-2">
                <span className="w-11 shrink-0 font-mono text-[13px] font-semibold">{i.ticker}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                  {i.companyName}
                  {i.teamName && <span className="text-muted-foreground"> · {i.teamName}</span>}
                </span>
                <UploadModelDialog targets={uploadTargets} defaultHoldingId={i.holdingId} label="Upload" />
              </li>
            ))}
          </>
        )}
      </ul>
    </Panel>
  );
}

function modelSummary(m: NonNullable<ModelListItem["model"]>): { text: string; warn?: boolean } {
  if (m.mappings === 0) return { text: "no line items mapped yet", warn: true };
  const parts: string[] = [];
  if (m.proposed) parts.push(`${m.proposed} to review`);
  if (m.exceptions) parts.push(`${m.exceptions} exception${m.exceptions === 1 ? "" : "s"}`);
  if (!parts.length && m.approved) parts.push(`${m.approved} approved`);
  return { text: parts.length ? parts.join(", ") : "nothing to review" };
}

// ---- right column ----

function ModelDetail({ d, uploadTargets }: { d: ModelDetailData; uploadTargets: UploadTarget[] }) {
  const counts = { proposed: 0, approved: 0, rejected: 0, exception: 0 };
  for (const p of d.proposals) counts[p.status]++;
  const openIds = d.proposals.filter((p) => p.status === "proposed").map((p) => p.id);
  const mapped = d.mappings.length > 0;
  const tabs: { key: ModelTab; label: string; count?: number; hot?: boolean }[] = [
    { key: "proposals", label: "Proposed values", count: counts.proposed, hot: counts.proposed > 0 },
    { key: "mappings", label: "Mappings", count: d.mappings.length },
    { key: "map", label: "Map a line item" },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[19px] font-semibold tracking-[-0.015em]">
            <Link href={d.holdingHref} className="font-mono hover:underline">
              {d.ticker}
            </Link>
            <span>·</span>
            <span className="min-w-0 truncate">{d.fileName}</span>
            <CountChip>v{d.version}</CountChip>
            <span className="truncate text-sm font-normal tracking-normal text-muted-foreground">{d.companyName}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {d.uploader ?? "Unknown uploader"} · uploaded {shortDate(d.createdAt)} ·{" "}
            {mapped ? (
              `${d.mappings.length} line item${d.mappings.length === 1 ? "" : "s"} mapped to reported figures`
            ) : (
              <span className="text-caution-foreground">No line items mapped to reported figures yet</span>
            )}{" "}
            · {d.cik ? `SEC CIK ${Number(d.cik)}` : <span className="text-caution-foreground">Not an SEC filer, so no values can be proposed from filings</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            {d.versions.length > 1 && (
              <>
                <span>Versions</span>
                {d.versions.map((v, i) => (
                  <span key={v.id} className="font-mono text-xs">
                    {i > 0 && <span className="mr-1.5 text-muted-foreground">·</span>}
                    {v.id === d.id ? <strong className="text-foreground">v{v.version}</strong> : <Link href={v.href} className="hover:text-foreground hover:underline">v{v.version}</Link>}
                  </span>
                ))}
                <span>·</span>
              </>
            )}
            <a href={d.downloadHref} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
              <Download className="size-3.5" />
              Download v{d.version}
            </a>
            <span>·</span>
            <UploadNewVersion targets={uploadTargets} holdingTicker={d.ticker} />
          </div>
        </div>
        {mapped && (
          <div className="flex flex-wrap items-center gap-2">
            {openIds.length > 0 && (
              <>
                <RejectAllButton ids={openIds} />
                <form action={approveAllProposed}>
                  <input type="hidden" name="modelId" value={d.id} />
                  <Button type="submit" variant="outline" size="lg">
                    Approve all
                  </Button>
                </form>
              </>
            )}
            <form action={writeApproved}>
              <input type="hidden" name="modelId" value={d.id} />
              <Button type="submit" size="lg" disabled={counts.approved === 0} title={counts.approved ? `Write ${counts.approved} approved value${counts.approved === 1 ? "" : "s"} into a new version` : "Approve values first"}>
                <FileDown />
                Write {counts.approved > 0 ? `${counts.approved} ` : ""}approved into v{d.nextVersion}
              </Button>
            </form>
          </div>
        )}
      </div>

      {d.ok && <Banner tone="good">{d.ok}</Banner>}
      {d.error && <Banner tone="error">{d.error}</Banner>}

      <nav className="-mb-1 flex gap-5 border-b" aria-label="Model sections">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`${d.href}?tab=${t.key}`}
            scroll={false}
            aria-current={d.tab === t.key ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-1.5 text-sm whitespace-nowrap",
              d.tab === t.key ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && <CountChip hot={t.hot}>{t.count}</CountChip>}
          </Link>
        ))}
      </nav>

      {d.tab === "proposals" &&
        (mapped ? (
          <ProposalsPanels d={d} counts={counts} />
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-1 text-sm text-muted-foreground">
            Map at least one line item first. You enter its first period by hand; Hoot checks the other periods against that number.
            <Button nativeButton={false} render={<Link href={`${d.href}?tab=map`} scroll={false} />} size="sm">
              Map a line item
            </Button>
          </div>
        ))}
      {d.tab === "mappings" && <MappingsPanel d={d} />}
      {d.tab === "map" && <MappingEditor modelId={d.id} workbook={d.workbook} existing={d.mappings.map((mm) => ({ sheet: mm.sheet, rowRef: mm.rowRef }))} />}
    </div>
  );
}

function UploadNewVersion({ targets, holdingTicker }: { targets: UploadTarget[]; holdingTicker: string }) {
  const t = targets.find((x) => x.ticker === holdingTicker);
  if (!t) return null;
  return <UploadModelDialog targets={targets} defaultHoldingId={t.id} label="Upload a new version" link />;
}

const GRID = "grid grid-cols-[minmax(140px,1fr)_minmax(0,1.25fr)_96px_100px_minmax(0,150px)_68px] items-center gap-3";

function ProposalsPanels({ d, counts }: { d: ModelDetailData; counts: Record<ModelProposalRow["status"], number> }) {
  const rows = d.proposals.filter((p) => p.status !== "exception");
  const exceptions = d.proposals.filter((p) => p.status === "exception");
  return (
    <>
      <Panel>
        <PanelHeader title="Proposed values">
          <span className="truncate text-[12.5px] text-muted-foreground">Straight from SEC filings, not written by AI · formula cells are never touched</span>
        </PanelHeader>
        {d.proposals.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-4 py-4 text-[13.5px] text-muted-foreground">
            Generate proposals to fill the other mapped periods from the figures the company reported to the SEC. Each proposal carries its period, unit, reported label, filing, and derivation.
            <GenerateButton d={d} label="Generate proposals" primary />
          </div>
        ) : (
          <div className="flex flex-col overflow-x-auto">
            <div className="flex min-w-[760px] flex-col">
              <div className={cn(GRID, "h-[34px] shrink-0 border-b px-4 text-xs text-muted-foreground")}>
                <span>Line item · cell</span>
                <span title="The XBRL tag the company used for this figure in its SEC filing">Reported figure</span>
                <span>Period</span>
                <span className="text-right">Proposed</span>
                <span>Derivation</span>
                <span className="text-right">Decision</span>
              </div>
              {rows.length === 0 && <p className="px-4 py-3 text-[13.5px] text-muted-foreground">Only exceptions are left; they are below.</p>}
              {rows.map((p) => (
                <ProposalRow key={p.id} p={p} />
              ))}
            </div>
          </div>
        )}
        <PanelFooter>
          <span className="font-mono text-[11.5px]">
            {counts.proposed} open · {counts.approved} approved · {counts.exception} exception{counts.exception === 1 ? "" : "s"} · {counts.rejected} rejected
          </span>
          <span className="min-w-0 flex-1 truncate">Writing creates a new file version; the previous version stays downloadable.</span>
          {d.proposals.length > 0 && <GenerateButton d={d} label="Regenerate open" />}
        </PanelFooter>
      </Panel>
      {exceptions.length > 0 && <ExceptionsPanel rows={exceptions} />}
    </>
  );
}

function GenerateButton({ d, label, primary }: { d: ModelDetailData; label: string; primary?: boolean }) {
  return (
    <form action={generateProposals}>
      <input type="hidden" name="modelId" value={d.id} />
      <Button type="submit" size="sm" variant={primary ? "default" : "outline"} disabled={!d.cik} title={d.cik ? "Keeps decisions already made; regenerates everything still open" : "Not an SEC filer, so there are no reported figures to propose from"}>
        {label}
      </Button>
    </form>
  );
}

function ProposalRow({ p }: { p: ModelProposalRow }) {
  const extension = p.taxonomy !== "us-gaap";
  return (
    <div
      className={cn(
        GRID,
        "min-h-12 border-b border-row px-4 py-1.5 text-[13.5px]",
        p.status === "approved" && "bg-good-tint",
        p.status === "rejected" && "text-muted-foreground [&_.value]:line-through",
      )}
    >
      <span className="min-w-0">
        <span className="font-medium">{p.label}</span>
        <span className="ml-2 font-mono text-[11.5px] text-muted-foreground" title={`${p.sheet}!${p.cellRef}`}>
          {p.cellRef}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate font-mono text-[11.5px] text-ink-2" title={`${p.taxonomy}:${p.concept}`}>
          {p.taxonomy}:{p.concept}
        </span>
        {p.reportedLabel && (
          <span className="block truncate text-[11.5px] text-muted-foreground" title={`Reported as: ${p.reportedLabel}`}>
            {p.reportedLabel}
          </span>
        )}
      </span>
      <span className="min-w-0 font-mono text-xs">
        {periodLabel(p.periodEnd)}
        {p.fiscalPeriod && (
          <span className="block truncate text-[11px] text-muted-foreground" title={`Tagged ${p.fiscalPeriod}: fiscal year and period as tagged in the source filing; comparatives carry the filing's tag, not the period's`}>
            {p.fiscalPeriod}
          </span>
        )}
      </span>
      <span className="value text-right font-mono text-[13px] font-medium">{fmtValue(p.value)}</span>
      <Derivation p={p} extension={extension} />
      <DecisionButtons id={p.id} status={p.status} canApprove={p.value !== null} reviewer={p.reviewer} />
    </div>
  );
}

function Derivation({ p, extension }: { p: ModelProposalRow; extension: boolean }) {
  return (
    <span className="min-w-0 text-[12.5px]">
      <span className={cn("block truncate", extension || p.derivation ? "text-caution-foreground" : "text-muted-foreground")} title={p.derivation ?? undefined}>
        {p.derivation ? "Derived, see note" : "Reported"}
        {extension && " · Company extension"}
      </span>
      {p.sourceUrl ? (
        <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="block truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline">
          {p.accession?.slice(-6) ?? "filing"} · {p.filedAt}
        </a>
      ) : null}
    </span>
  );
}

function ExceptionsPanel({ rows }: { rows: ModelProposalRow[] }) {
  return (
    <section className="shrink-0 overflow-hidden rounded-[14px] bg-[color-mix(in_oklch,var(--caution)_40%,var(--card))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--caution-foreground)_28%,var(--card))]">
      <div className="flex h-[42px] items-center border-b border-[color-mix(in_oklch,var(--caution-foreground)_28%,var(--card))] px-4">
        <h2 className="flex-1 text-[14.5px] font-semibold">Exceptions · need your judgment</h2>
        <span className="font-mono text-[12.5px] text-caution-foreground">{rows.length}</span>
      </div>
      {rows.map((p) => (
        <div key={p.id} className="flex min-h-11 items-center gap-3 border-b border-[color-mix(in_oklch,var(--caution-foreground)_20%,var(--card))] px-4 py-1.5 text-[13.5px] last:border-b-0">
          <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-card px-[9px] text-[11.5px] font-semibold whitespace-nowrap text-caution-foreground">{exceptionKind(p.exceptionReason)}</span>
          <span className="shrink-0 font-medium">
            {p.label} <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{p.cellRef} · {periodLabel(p.periodEnd)}</span>
          </span>
          <span className="line-clamp-2 min-w-0 flex-1 text-ink-2" title={p.exceptionReason ?? undefined}>
            {p.exceptionReason}
          </span>
          <ExceptionDecide id={p.id} canApprove={p.value !== null}>
            <div className="grid gap-1.5 text-[13px]">
              <div className="font-semibold">
                {p.label} <span className="font-mono text-xs font-normal text-muted-foreground">{p.sheet}!{p.cellRef}</span>
              </div>
              <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground">Period</dt>
                <dd className="font-mono">
                  {periodLabel(p.periodEnd)}
                  {p.fiscalPeriod && <span className="text-muted-foreground"> · tagged {p.fiscalPeriod}</span>}
                </dd>
                <dt className="text-muted-foreground">Value</dt>
                <dd className="font-mono">{fmtValue(p.value)}</dd>
                <dt className="text-muted-foreground">Concept</dt>
                <dd className="truncate font-mono text-[11.5px]" title={`${p.taxonomy}:${p.concept}`}>
                  {p.taxonomy}:{p.concept}
                </dd>
                {p.reportedLabel && (
                  <>
                    <dt className="text-muted-foreground">Reported as</dt>
                    <dd>{p.reportedLabel}</dd>
                  </>
                )}
                {p.derivation && (
                  <>
                    <dt className="text-muted-foreground">Derivation</dt>
                    <dd>{p.derivation}</dd>
                  </>
                )}
                {p.sourceUrl && (
                  <>
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>
                      <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] hover:underline">
                        {p.accession?.slice(-6) ?? "filing"} · {p.filedAt}
                      </a>
                    </dd>
                  </>
                )}
              </dl>
              <p className="text-[12.5px] text-caution-foreground">{p.exceptionReason}</p>
            </div>
          </ExceptionDecide>
        </div>
      ))}
    </section>
  );
}

function MappingsPanel({ d }: { d: ModelDetailData }) {
  return (
    <Panel>
      <PanelHeader title="Mappings" count={d.mappings.length} aside="Carried forward to each new version" />
      {d.mappings.length === 0 ? (
        <p className="px-4 py-3 text-[13.5px] text-muted-foreground">No line items mapped yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Model line</TableHead>
                <TableHead>Concept</TableHead>
                <TableHead>Unit · scale</TableHead>
                <TableHead>Periods</TableHead>
                <TableHead>Rationale</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.mappings.map((mm) => (
                <TableRow key={mm.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium">{mm.labelInModel}</div>
                    <div className="font-mono text-[11.5px] text-muted-foreground">
                      {mm.sheet}!row {mm.rowRef}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px]">{mm.concept}</TableCell>
                  <TableCell className="text-xs">
                    {mm.unit} · ÷{fmtNumber(mm.scale)}
                    {mm.sign === -1 ? " · sign flipped" : ""} · {mm.periodType}
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px]">
                    {Object.entries(mm.periodColumns)
                      .sort((a, b) => (a[1] < b[1] ? -1 : 1))
                      .map(([c, dt]) => `${c}=${dt}`)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-xs text-muted-foreground" title={mm.rationale ?? ""}>
                    {mm.rationale}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <form action={deleteMapping}>
                      <input type="hidden" name="id" value={mm.id} />
                      <Button type="submit" size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive">
                        Remove
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

function Banner({ tone, children }: { tone: "good" | "error"; children: React.ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-[10px] px-3.5 py-2 text-[13.5px]", tone === "good" ? "bg-good text-good-foreground" : "bg-destructive/10 text-destructive")}>
      {children}
    </div>
  );
}

// ---- small formatters ----

const shortDate = (d: Date) => fmtDay(d);

/** A fiscal period end, always with its year. */
const periodLabel = (d: string) => fmtDate(d);

function fmtValue(v: number | null) {
  return fmtNumber(v);
}
