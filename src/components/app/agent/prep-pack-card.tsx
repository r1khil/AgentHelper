import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDay, relativeTime } from "@/lib/format";
import type { PrepPack } from "@/lib/agent/prep-types";
import { bulletCount, cleanBulletText } from "@/lib/agent/prep-pack";
import { resolveSource } from "@/lib/agent/source-resolution";

/**
 * The agent's pre-earnings evidence pack: reported figures, guidance on record, consensus, the team's
 * own questions, and items to watch, each bullet with numbered citations. Renders on the server; `actions` slots a
 * rebuild button in for leads and admins. `compact` (the research board's side column) shows a line about the pack and
 * opens it on request.
 */
export function PrepPackCard({
  pack,
  compact,
  actions,
  className,
}: {
  pack: PrepPack;
  compact?: boolean;
  /** Kept for the report page: the pack is already a plain section, never a card. */
  plain?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const n = bulletCount(pack);
  const summary = (
    <span className="text-caption text-ink-2">
      Reports {fmtDay(pack.reportDate)} · {n} sourced bullet{n === 1 ? "" : "s"} · built {relativeTime(pack.builtAt)}
    </span>
  );
  const body = <PackBody pack={pack} compact={compact} />;
  if (compact) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-x-2">
          {summary}
          {actions && <span className="ml-auto">{actions}</span>}
        </div>
        <details className="group mt-1">
          <summary className="w-fit cursor-pointer list-none text-caption font-semibold text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Read the prep pack</span>
            <span className="hidden group-open:inline">Hide the prep pack</span>
          </summary>
          <div className="mt-2">{body}</div>
        </details>
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2 border-b pb-2.5">
        <h3 className="text-body font-bold">Earnings prep pack</h3>
        {summary}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      <div className="pt-3">{body}</div>
    </div>
  );
}

function PackBody({ pack, compact }: { pack: PrepPack; compact?: boolean }) {
  const numbers = new Map(pack.sources.map((s, i) => [s.id, i + 1]));
  return (
    <div className="text-body leading-[18px]">
      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "md:grid-cols-2")}>
        {pack.sections.map((s) => (
          <section key={s.key} className={cn(!compact && s.key === "not_retrieved" && "md:col-span-2")}>
            <h4 className={cn("text-caption font-semibold", s.key === "not_retrieved" ? "text-caution-foreground" : "text-muted-foreground")}>{s.title}</h4>
            <ul className="mt-1.5 space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span>
                    {cleanBulletText(b.text)}
                    {b.sourceIds.map((id) => {
                      const src = pack.sources.find((x) => x.id === id);
                      const num = numbers.get(id);
                      if (!src || !num) return null;
                      const t = resolveSource(src);
                      const title = `${src.title}${src.publishedAt ? ` (${src.publishedAt.slice(0, 10)})` : ""}`;
                      return t.kind === "external" ? (
                        <a key={id} href={t.href} target="_blank" rel="noopener noreferrer" title={title} className="cite text-foreground">
                          {num}
                        </a>
                      ) : (
                        <span key={id} title={src.title} className="cite text-foreground no-underline">
                          {num}
                        </span>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {pack.sources.length > 0 && (
        <ol className={cn("mt-4 grid gap-0.5 border-t pt-3 text-caption leading-4 text-muted-foreground", !compact && "md:grid-cols-2")}>
          {pack.sources.map((s, i) => {
            const t = resolveSource(s);
            const label = `${s.title}${s.publishedAt ? ` · ${fmtDate(s.publishedAt)}` : ""}`;
            return (
              <li key={s.id} className="flex gap-1.5">
                <span className="w-4 shrink-0 text-right">{i + 1}.</span>
                {t.kind === "external" ? (
                  <a href={t.href} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-foreground hover:underline" title={label}>
                    {label}
                  </a>
                ) : (
                  <span className="min-w-0 truncate" title={label}>
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-caption text-muted-foreground">Write your expectations, key questions and thesis-change criteria before they lock at the report.</p>
    </div>
  );
}
