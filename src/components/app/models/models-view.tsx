import Link from "next/link";
import { approveAllProposed, deleteMapping, generateProposals, writeApproved } from "@/lib/actions/models";
import { fmtDate, fmtDay, fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHead, PageHero, ScopeMenu } from "@/components/app/page-head";
import type { TabItem } from "@/components/app/tabs";
import { Button } from "@/components/ui/button";
import { RowLink } from "@/components/app/row-link";
import { MappingEditor } from "./mapping-editor";
import { UploadModelDialog } from "./upload-model-dialog";
import { DecisionButtons, ExceptionDecide, RejectAllButton } from "./review-controls";
import { exceptionKind } from "./exception-kind";
import type { ModelDetailData, ModelListItem, ModelProposalRow, ModelTab, UploadTarget } from "./types";

/** The scope the page is in: its URL slug and what to call it ("Whole fund" or the team's name). */
export type ModelsScope = { slug: string; label: string };

/**
 * Models as a list and a model: holdings and their latest model on the left, the selected model's values to decide
 * on the right, under a page header whose tabs are the model's sections. Rendered by both /models (first model with
 * proposals waiting selected) and /models/[modelId].
 */
export function ModelsView({
  scope,
  items,
  uploadTargets,
  selected,
  selectedHoldingId,
  error,
  list,
}: {
  scope: ModelsScope;
  items: ModelListItem[];
  uploadTargets: UploadTarget[];
  selected: ModelDetailData | null;
  selectedHoldingId: string | null;
  /** A list-level error (e.g. from an upload) when no model is selected to show it. */
  error?: string | null;
  /** Rendered by /models, every holding's model, rather than one model's own route. */
  list?: boolean;
}) {
  const toDecide = items.reduce((n, i) => n + (i.model ? i.model.proposed + i.model.exceptions : 0), 0);
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      <PageHead
        crumbs={
          // One model belongs to its holding (Portfolio / META / the file); the list of every holding's is Portfolio's.
          selected && !list
            ? [{ label: "Portfolio", href: `/t/${scope.slug}` }, { label: selected.ticker, href: `${selected.holdingHref}?tab=model` }, { label: selected.fileName }]
            : [{ label: "Portfolio", href: `/t/${scope.slug}` }, { label: "Models" }]
        }
        tabs={selected ? modelTabs(selected) : false}
        actions={
          selected ? (
            <UploadNewVersion targets={uploadTargets} holdingTicker={selected.ticker} />
          ) : (
            <UploadModelDialog targets={uploadTargets} defaultHoldingId={selectedHoldingId} label="Upload .xlsx" trigger="header" />
          )
        }
      />
      <div className="flex min-h-0 flex-1">
        <ModelList items={items} uploadTargets={uploadTargets} selectedHoldingId={selectedHoldingId} />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pt-6 pr-10 pb-10 pl-8">
          {selected ? (
            <ModelDetail d={selected} />
          ) : (
            <>
              {error && (
                <p role="alert" className="mb-4 border-b pb-3 text-body text-caution-foreground">
                  {error}
                </p>
              )}
              <PageHero
                label={scope.label}
                value={toDecide > 0 ? `${toDecide} to decide` : "Nothing to decide"}
                note={toDecide > 0 ? "Pick a model on the left to review its proposed values." : "No model has values waiting for review. Pick one on the left to see its mappings."}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The model's sections as the page header's tabs; each one is a `?tab=` on the model's URL. */
function modelTabs(d: ModelDetailData): TabItem[] {
  const open = d.proposals.filter((p) => p.status === "proposed" || p.status === "exception").length;
  return (
    [
      { key: "proposals", label: "Proposed values", count: open > 0 ? open : undefined, hot: open > 0 },
      { key: "mappings", label: "Mappings", count: d.mappings.length > 0 ? d.mappings.length : undefined },
      { key: "map", label: "Map a line item" },
    ] satisfies { key: ModelTab; label: string; count?: number; hot?: boolean }[]
  ).map((t) => ({ ...t, href: `${d.href}?tab=${t.key}`, active: d.tab === t.key }));
}

function UploadNewVersion({ targets, holdingTicker }: { targets: UploadTarget[]; holdingTicker: string }) {
  const t = targets.find((x) => x.ticker === holdingTicker);
  if (!t) return null;
  return <UploadModelDialog targets={targets} defaultHoldingId={t.id} label="Upload a new version" trigger="header" />;
}

// ---- left column ----

/** A model's state in words, for the list: what is waiting, or why nothing is. */
export function modelStatus(i: ModelListItem): { text: string; tone: "caution" | "muted" } {
  const m = i.model;
  if (!m) return { text: "no model yet", tone: "muted" };
  const open = m.proposed + m.exceptions;
  if (open > 0) return { text: `${open} to decide`, tone: "caution" };
  if (!i.hasCik) return { text: "not an SEC filer", tone: "muted" };
  if (m.mappings === 0) return { text: "nothing mapped yet", tone: "muted" };
  return { text: "up to date", tone: "muted" };
}

function ModelList({ items, uploadTargets, selectedHoldingId }: { items: ModelListItem[]; uploadTargets: UploadTarget[]; selectedHoldingId: string | null }) {
  const withModel = items.filter((i) => i.model);
  const without = items.filter((i) => !i.model);
  return (
    <aside aria-label="Models" className="flex w-60 shrink-0 flex-col overflow-y-auto border-r pt-3.5 pr-4 pb-10 pl-10">
      <div className="mb-1.5 self-start">
        <ScopeMenu label="All teams" />
      </div>
      <ul>
        {withModel.map((i) => {
          const m = i.model!;
          const on = i.holdingId === selectedHoldingId;
          const status = modelStatus(i);
          return (
            <li key={i.holdingId}>
              <RowLink
                href={m.href}
                aria-current={on ? "page" : undefined}
                title={`${i.companyName}, version ${m.version} of ${m.versions}, uploaded by ${m.uploader ?? "an unknown uploader"}`}
                className={cn(
                  "-mx-2 flex flex-col rounded-lg border-b border-row px-2 py-[9px] transition-colors outline-none hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  on && "bg-secondary hover:bg-secondary",
                )}
              >
                <span className={cn("truncate text-body", on ? "font-semibold" : "font-normal")}>{m.fileName}</span>
                <span className={cn("truncate text-caption", status.tone === "caution" ? "text-caution-foreground" : "text-muted-foreground")}>
                  {[i.teamName, status.text].filter(Boolean).join(", ")}
                </span>
              </RowLink>
            </li>
          );
        })}
      </ul>
      {without.length > 0 && (
        <section aria-label="No model yet">
          <h2 className="pt-3.5 pb-1 text-caption font-semibold text-muted-foreground">No model yet, {without.length}</h2>
          <ul>
            {without.map((i) => (
              <li key={i.holdingId} className="flex items-center gap-2 border-b border-row py-[9px]">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-semibold">{i.ticker}</span>
                  <span className="truncate text-caption text-muted-foreground" title={i.companyName}>
                    {[i.teamName, !i.hasCik && "not an SEC filer"].filter(Boolean).join(", ") || i.companyName}
                  </span>
                </span>
                <UploadModelDialog targets={uploadTargets} defaultHoldingId={i.holdingId} label="Upload" trigger="link" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

// ---- right column ----

/** What the big number says: how many values wait for a decision, or the reason none can. */
function headline(d: ModelDetailData, counts: Record<ModelProposalRow["status"], number>) {
  const open = counts.proposed + counts.exception;
  const mapped = d.mappings.length > 0;
  if (!d.cik) return { figure: "Not an SEC filer", line: `No values can be proposed from filings${mapped ? "." : ", and no line items are mapped yet."}` };
  if (!mapped) return { figure: "Nothing mapped yet", line: "Map a line item first. You enter its first period by hand; Hoot checks the other periods against that number." };
  if (d.proposals.length === 0) return { figure: "No values proposed yet", line: "Generate proposals to fill the other mapped periods from the figures the company reported to the SEC." };
  const parts: string[] = [];
  if (counts.proposed) parts.push(`${counts.proposed} reported figure${counts.proposed === 1 ? "" : "s"} match${counts.proposed === 1 ? "es" : ""} your mappings`);
  if (counts.exception) parts.push(`${counts.exception} exception${counts.exception === 1 ? "" : "s"} need${counts.exception === 1 ? "s" : ""} your judgment`);
  if (counts.approved) parts.push(`${counts.approved} approved`);
  if (counts.rejected) parts.push(`${counts.rejected} rejected`);
  if (open > 0) return { figure: `${open} value${open === 1 ? "" : "s"} to decide`, line: parts.join(", ") };
  if (counts.approved > 0) return { figure: `${counts.approved} value${counts.approved === 1 ? "" : "s"} approved`, line: `Write ${counts.approved === 1 ? "it" : "them"} into version ${d.nextVersion} when you are ready${counts.rejected ? `. ${counts.rejected} rejected` : ""}` };
  return { figure: "Nothing to decide", line: parts.join(", ") || "Every proposed value has been decided." };
}

function ModelDetail({ d }: { d: ModelDetailData }) {
  const counts = { proposed: 0, approved: 0, rejected: 0, exception: 0 };
  for (const p of d.proposals) counts[p.status]++;
  const mapped = d.mappings.length > 0;
  const { figure, line } = headline(d, counts);
  const latestFiling = d.proposals.reduce<string | null>((a, p) => (p.filedAt && (!a || p.filedAt > a) ? p.filedAt : a), null);
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <PageHero
          className="min-w-0 flex-1 basis-96"
          label={
            <>
              <Link href={d.holdingHref} title={d.companyName} className="font-semibold text-foreground underline-offset-2 hover:underline">
                {d.ticker}
              </Link>
              , version {d.version}, uploaded {fmtDay(d.createdAt)} by {d.uploader ?? "an unknown uploader"}
              {mapped ? `, ${d.mappings.length} line item${d.mappings.length === 1 ? "" : "s"} mapped` : null}
            </>
          }
          value={figure}
          note={<span className={d.cik ? undefined : "text-caution-foreground"}>{line}</span>}
        />
        <div className="flex flex-col items-end gap-0.5 pb-1 text-caption">
          {d.cik && <span className="text-ink-2">Straight from SEC filings (XBRL), not written by AI</span>}
          <span className="text-muted-foreground">
            {d.cik ? `SEC CIK ${Number(d.cik)}` : null}
            {d.cik && latestFiling ? ", " : null}
            {latestFiling ? `latest filing ${fmtDate(latestFiling)}` : null}
          </span>
          <span className="flex flex-wrap items-center justify-end gap-x-1.5 text-muted-foreground">
            {d.versions.length > 1 && (
              <>
                <span>Versions</span>
                {d.versions.map((v, i) => (
                  <span key={v.id}>
                    {v.id === d.id ? <strong className="font-semibold text-foreground">{v.version}</strong> : <Link href={v.href} className="underline underline-offset-2 hover:text-foreground">{v.version}</Link>}
                    {i < d.versions.length - 1 ? "," : "."}
                  </span>
                ))}
              </>
            )}
            <a href={d.downloadHref} className="underline underline-offset-2 hover:text-foreground">
              Download version {d.version}
            </a>
          </span>
        </div>
      </div>

      {d.ok && (
        <p role="status" className="mt-4 border-y py-2 text-body">
          {d.ok}
        </p>
      )}
      {d.error && (
        <p role="alert" className="mt-4 border-y py-2 text-body text-caution-foreground">
          {d.error}
        </p>
      )}

      {d.tab === "proposals" &&
        (mapped ? (
          <ProposalsSection d={d} counts={counts} />
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-muted-foreground">
            Map at least one line item first. You enter its first period by hand; Hoot checks the other periods against that number.
            <Button nativeButton={false} render={<Link href={`${d.href}?tab=map`} scroll={false} />} variant="secondary">
              Map a line item
            </Button>
          </div>
        ))}
      {d.tab === "mappings" && <MappingsSection d={d} />}
      {d.tab === "map" && (
        <div className="mt-6">
          <MappingEditor modelId={d.id} workbook={d.workbook} existing={d.mappings.map((mm) => ({ sheet: mm.sheet, rowRef: mm.rowRef }))} />
        </div>
      )}
    </>
  );
}

const GRID = "grid grid-cols-[minmax(0,1fr)_104px_100px_100px_minmax(0,1.4fr)_176px] items-center gap-x-3";
const MAX_READ_ROWS = 400;

/** The value the workbook holds in a cell now, as the reader would see it; null when the cell is empty. */
function cellNow(d: ModelDetailData, sheet: string, ref: string): { text: string; formula?: string } | "unknown" | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  if (!m) return "unknown";
  const row = Number(m[2]);
  if (row > MAX_READ_ROWS) return "unknown";
  const cell = d.workbook.sheets.find((s) => s.name === sheet)?.rows.find((r) => r.r === row)?.cells.find((c) => c.ref === ref);
  if (!cell || cell.v === null || cell.v === "") return null;
  return { text: typeof cell.v === "number" ? fmtNumber(cell.v) : String(cell.v), formula: cell.isFormula ? cell.f : undefined };
}

function ProposalsSection({ d, counts }: { d: ModelDetailData; counts: Record<ModelProposalRow["status"], number> }) {
  const rows = d.proposals.filter((p) => p.status !== "exception");
  const exceptions = d.proposals.filter((p) => p.status === "exception");
  const openIds = d.proposals.filter((p) => p.status === "proposed").map((p) => p.id);
  return (
    <>
      {d.proposals.length === 0 ? (
        <div className="mt-6 flex flex-col items-start gap-3 border-t pt-4 text-body text-muted-foreground">
          Each proposal carries its period, unit, reported label, filing, and derivation.
          <GenerateButton d={d} label="Generate proposals" primary />
        </div>
      ) : (
        <div role="table" aria-label="Proposed values" className="mt-[22px] overflow-x-auto text-body">
          <div className="min-w-[760px]">
            <div role="row" className={cn(GRID, "h-8 border-b text-caption text-muted-foreground")}>
              <span role="columnheader">Line item · cell</span>
              <span role="columnheader">Period</span>
              <span role="columnheader" className="text-right">
                Model shows
              </span>
              <span role="columnheader" className="text-right" title="The figure the company reported to the SEC, in the model's units">
                Reported
              </span>
              <span role="columnheader" title="The XBRL tag the company used for this figure in its SEC filing">
                Source
              </span>
              <span role="columnheader" className="text-right">
                Decision
              </span>
            </div>
            {rows.map((p) => (
              <ProposalRow key={p.id} p={p} now={cellNow(d, p.sheet, p.cellRef)} />
            ))}
          </div>
        </div>
      )}

      {d.proposals.length > 0 && rows.length === 0 && <p className="border-b border-row py-3 text-body text-muted-foreground">Only exceptions are left; they are below.</p>}
      {exceptions.length > 0 && <ExceptionsSection rows={exceptions} />}

      {mappedFooter(d, counts, openIds)}
    </>
  );
}

/** Regenerate, approve or reject the open values, and write the approved ones into the next version. */
function mappedFooter(d: ModelDetailData, counts: Record<ModelProposalRow["status"], number>, openIds: string[]) {
  const n = counts.approved;
  const write = `Write ${n} approved value${n === 1 ? "" : "s"} into version ${d.nextVersion}`;
  return (
    <div className="mt-[22px] flex flex-wrap items-center gap-2">
      {d.proposals.length > 0 && <GenerateButton d={d} label="Regenerate open" />}
      {openIds.length > 0 && (
        <form action={approveAllProposed}>
          <input type="hidden" name="modelId" value={d.id} />
          <Button type="submit" variant="secondary">
            Approve all
          </Button>
        </form>
      )}
      {openIds.length > 0 && <RejectAllButton ids={openIds} />}
      <span className="flex-1" />
      <span className="text-caption text-muted-foreground">Formula cells are never written; version {d.version} stays downloadable</span>
      <form action={writeApproved}>
        <input type="hidden" name="modelId" value={d.id} />
        <Button type="submit" disabled={n === 0} title={n ? `Creates version ${d.nextVersion} from the ${n} approved value${n === 1 ? "" : "s"}` : "Approve values first"}>
          {write}
        </Button>
      </form>
    </div>
  );
}

function GenerateButton({ d, label, primary }: { d: ModelDetailData; label: string; primary?: boolean }) {
  return (
    <form action={generateProposals}>
      <input type="hidden" name="modelId" value={d.id} />
      <Button type="submit" variant={primary ? "default" : "secondary"} disabled={!d.cik} title={d.cik ? "Keeps decisions already made; regenerates everything still open" : "Not an SEC filer, so there are no reported figures to propose from"}>
        {label}
      </Button>
    </form>
  );
}

function ProposalRow({ p, now }: { p: ModelProposalRow; now: ReturnType<typeof cellNow> }) {
  const extension = p.taxonomy !== "us-gaap";
  return (
    <div role="row" className={cn(GRID, "min-h-12 border-b border-row py-1.5", p.status === "rejected" && "text-muted-foreground")}>
      <span role="cell" className="flex min-w-0 flex-col">
        <b className="truncate font-semibold">{p.label}</b>
        <span className="truncate text-caption text-muted-foreground">
          {p.sheet}!{p.cellRef}
        </span>
      </span>
      <span
        role="cell"
        className="flex min-w-0 flex-col"
        title={p.fiscalPeriod ? `Tagged ${p.fiscalPeriod}: fiscal year and period as tagged in the source filing; comparatives carry the filing's tag, not the period's` : undefined}
      >
        <span>{fmtDate(p.periodEnd)}</span>
        {p.fiscalPeriod && <span className="truncate text-caption text-muted-foreground">{p.fiscalPeriod}</span>}
      </span>
      <span role="cell" className="text-right text-muted-foreground" title={typeof now === "object" && now?.formula ? `A formula cell: =${now.formula}` : undefined}>
        {now === "unknown" ? "—" : now === null ? "empty" : now.text}
      </span>
      <span role="cell" className={cn("text-right font-semibold", p.status === "rejected" && "line-through")}>
        {p.value === null ? <span className="font-normal text-muted-foreground">no value</span> : fmtNumber(p.value)}
      </span>
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-caption" title={`${p.taxonomy}:${p.concept}`}>
          {p.taxonomy}:{p.concept}
        </span>
        <span className="truncate text-caption text-muted-foreground" title={p.derivation ?? (p.reportedLabel ? `Reported as: ${p.reportedLabel}` : undefined)}>
          <span className={cn(p.derivation && "text-caution-foreground")}>{p.derivation ? "Derived, see note" : "Reported"}</span>
          {p.unit && ` · ${p.unit}`}
          {extension && <span className="text-caution-foreground"> · Company extension</span>}
          {p.sourceUrl && (
            <>
              {" · "}
              <a href={p.sourceUrl} target="_blank" rel="noreferrer" title={`Filing ${p.accession ?? ""}`} className="underline underline-offset-2 hover:text-foreground">
                filed {p.filedAt ? fmtDay(p.filedAt) : "on EDGAR"}
              </a>
            </>
          )}
        </span>
      </span>
      <span role="cell" className="justify-self-end">
        <DecisionButtons id={p.id} status={p.status} canApprove={p.value !== null} reviewer={p.reviewer} />
      </span>
    </div>
  );
}

function ExceptionsSection({ rows }: { rows: ModelProposalRow[] }) {
  return (
    <section aria-label="Exceptions" className="mt-[26px]">
      <h2 className="text-title font-bold tracking-[-0.01em]">
        Exceptions <span className="font-medium text-muted-foreground">· need your judgment</span>
      </h2>
      <ul className="mt-1">
        {rows.map((p) => (
          <li key={p.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_auto] items-center gap-4 border-b border-row py-3 text-body">
            <span className="flex min-w-0 flex-col">
              <b className="font-semibold">{p.label}</b>
              <span className="truncate text-caption text-muted-foreground">
                {p.sheet}!{p.cellRef} · {fmtDate(p.periodEnd)}
              </span>
            </span>
            <span className="leading-5" title={p.exceptionReason ?? undefined}>
              <b className="font-semibold text-caution-foreground">{exceptionKind(p.exceptionReason)}.</b> <span className="text-ink-3">{p.exceptionReason}</span>
            </span>
            <ExceptionDecide id={p.id} canApprove={p.value !== null}>
              <div className="grid gap-1.5 text-body">
                <div className="font-semibold">
                  {p.label} <span className="font-normal text-muted-foreground">{p.sheet}!{p.cellRef}</span>
                </div>
                <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-body">
                  <dt className="text-muted-foreground">Period</dt>
                  <dd>
                    {fmtDate(p.periodEnd)}
                    {p.fiscalPeriod && <span className="text-muted-foreground"> · tagged {p.fiscalPeriod}</span>}
                  </dd>
                  <dt className="text-muted-foreground">Value</dt>
                  <dd>{fmtNumber(p.value)}</dd>
                  <dt className="text-muted-foreground">Concept</dt>
                  <dd className="truncate font-mono text-caption" title={`${p.taxonomy}:${p.concept}`}>
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
                        <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-caption underline underline-offset-2">
                          {p.accession?.slice(-6) ?? "filing"} · {p.filedAt}
                        </a>
                      </dd>
                    </>
                  )}
                </dl>
                <p className="text-body text-caution-foreground">{p.exceptionReason}</p>
              </div>
            </ExceptionDecide>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MAPPING_GRID = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_72px] items-center gap-x-3";

function MappingsSection({ d }: { d: ModelDetailData }) {
  return (
    <section aria-label="Mappings" className="mt-6">
      <div className="flex items-baseline">
        <h2 className="flex-1 text-title font-bold tracking-[-0.01em]">
          Mappings <span className="font-medium text-muted-foreground">· {d.mappings.length}</span>
        </h2>
        <span className="text-caption text-muted-foreground">Carried forward to each new version</span>
      </div>
      {d.mappings.length === 0 ? (
        <p className="mt-2 border-t pt-3 text-body text-muted-foreground">No line items mapped yet.</p>
      ) : (
        <div role="table" aria-label="Mappings" className="mt-2 overflow-x-auto text-body">
          <div className="min-w-[760px]">
            <div role="row" className={cn(MAPPING_GRID, "h-8 border-b text-caption text-muted-foreground")}>
              <span role="columnheader">Model line</span>
              <span role="columnheader">Concept</span>
              <span role="columnheader">Unit · scale</span>
              <span role="columnheader">Periods</span>
              <span role="columnheader">Rationale</span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>
            {d.mappings.map((mm) => (
              <div key={mm.id} role="row" className={cn(MAPPING_GRID, "min-h-12 border-b border-row py-1.5")}>
                <span role="cell" className="flex min-w-0 flex-col">
                  <b className="truncate font-semibold">{mm.labelInModel}</b>
                  <span className="text-caption text-muted-foreground">
                    {mm.sheet}!row {mm.rowRef}
                  </span>
                </span>
                <span role="cell" className="min-w-0 truncate font-mono text-caption" title={mm.concept}>
                  {mm.concept}
                </span>
                <span role="cell" className="text-caption">
                  {mm.unit} · ÷{fmtNumber(mm.scale)}
                  {mm.sign === -1 ? " · sign flipped" : ""} · {mm.periodType}
                </span>
                <span role="cell" className="text-caption">
                  {Object.entries(mm.periodColumns)
                    .sort((a, b) => (a[1] < b[1] ? -1 : 1))
                    .map(([c, dt]) => `${c}=${dt}`)
                    .join(", ")}
                </span>
                <span role="cell" className="line-clamp-2 text-caption text-muted-foreground" title={mm.rationale ?? ""}>
                  {mm.rationale}
                </span>
                <span role="cell" className="justify-self-end">
                  <form action={deleteMapping}>
                    <input type="hidden" name="id" value={mm.id} />
                    <Button type="submit" size="xs" variant="ghost">
                      Remove
                    </Button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
