import { cn } from "@/lib/utils";
import { RailCard as Card, RailRow as Row } from "@/components/app/rail-card";

export type RailRow = {
  k: string;
  v: React.ReactNode;
  /** Colours the value: green up, red down, amber for a status that wants a look, grey for none. */
  tone?: "up" | "down" | "caution" | "muted" | null;
  title?: string;
};

/**
 * A card in the holding page's rail (Fund position, Next report, Key statistics): the app's shared rail card with
 * label / value rows built from `rows`.
 */
export function RailCard({ id, title, aside, rows, note, children, className }: { id: string; title: React.ReactNode; aside?: React.ReactNode; rows?: RailRow[]; note?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <Card id={id} title={title} aside={aside} note={note} className={className}>
      {rows && <RailRows rows={rows} />}
      {children}
    </Card>
  );
}

export function RailRows({ rows }: { rows: RailRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <Row key={r.k} label={<span className="text-ink-2">{r.k}</span>} title={r.title}>
          <span
            className={cn(
              "max-w-[65%] min-w-0 text-right font-semibold text-balance tabular-nums",
              r.tone === "up" && "text-up",
              r.tone === "down" && "text-down",
              r.tone === "caution" && "text-caution-foreground",
              r.tone === "muted" && "font-normal text-muted-foreground",
            )}
          >
            {r.v}
          </span>
        </Row>
      ))}
    </>
  );
}
