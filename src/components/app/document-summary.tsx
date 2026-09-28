import type { DocSummary } from "@/lib/drive/summary";
import { isEmptySummary, isFailedSummary } from "@/lib/drive/summary";
import { relativeTime } from "@/lib/format";

type Props = {
  summary: DocSummary | null;
  summaryModel: string | null;
  summarizedAt: Date | null;
};

function Row({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <dt className="label-mono text-muted-foreground">{label}</dt>
      <dd>
        <ul className="list-disc space-y-0.5 pl-4">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

/**
 * What the app extracted from a document. Server component; a plain <details> so it needs no JS. A missing or failed
 * summary renders nothing, so the row shows only the file's name and date; the ingest job logs and retries failures.
 */
export function DocumentSummary({ summary, summarizedAt }: Props) {
  if (!summary || isFailedSummary(summary)) return null;
  if (isEmptySummary(summary)) return summary.evidenceNote ? <p className="mt-1 text-xs text-muted-foreground">{summary.evidenceNote}</p> : null;
  const headline = [summary.docDate ? `Dated ${summary.docDate}` : null, summary.rating ? `Rating ${summary.rating}` : null, summary.priceTarget ? `PT ${summary.priceTarget}` : null].filter(Boolean).join(" · ");
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {summary.oneLine || "Summary"}
        {headline ? <span className="ml-2 font-mono tnum">{headline}</span> : null}
      </summary>
      <dl className="mt-2 space-y-2 rounded-[10px] bg-band p-3 text-sm shadow-[0_0_0_1px_var(--border)]">
        {summary.thesis && (
          <div>
            <dt className="label-mono text-muted-foreground">Thesis as written</dt>
            <dd className="whitespace-pre-wrap">{summary.thesis}</dd>
          </div>
        )}
        <Row label="Key numbers" items={summary.keyNumbers} />
        <Row label="Catalysts" items={summary.catalysts} />
        <Row label="Risks" items={summary.risks} />
        {summary.evidenceNote && <p className="text-xs text-muted-foreground">{summary.evidenceNote}</p>}
        <p className="text-[11px] text-muted-foreground">
          Extracted by the app
          {summarizedAt ? ` · ${relativeTime(summarizedAt)}` : ""}. Check the document before relying on a figure.
        </p>
      </dl>
    </details>
  );
}
