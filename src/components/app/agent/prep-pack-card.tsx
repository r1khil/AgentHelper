import type { ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, relativeTime } from "@/lib/format";
import type { PrepPack } from "@/lib/agent/prep-types";
import { bulletCount, cleanBulletText } from "@/lib/agent/prep-pack";
import { resolveSource } from "@/lib/agent/source-resolution";

/**
 * The agent's pre-earnings evidence pack: reported figures, guidance on record, consensus, the team's
 * own questions, and items to watch, each bullet with numbered source chips. Renders on the server;
 * `actions` slots a rebuild button in for leads and admins.
 */
export function PrepPackCard({ pack, compact, actions, className }: { pack: PrepPack; compact?: boolean; actions?: ReactNode; className?: string }) {
  const numbers = new Map(pack.sources.map((s, i) => [s.id, i + 1]));
  const n = bulletCount(pack);
  return (
    <div className={cn("rounded-xl bg-card ring-1 ring-foreground/10", compact ? "mx-6 mt-4" : "", className)}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <ClipboardList className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Earnings prep pack</span>
        <span className="text-xs text-muted-foreground">
          reports {fmtDate(pack.reportDate)} · {n} sourced bullet{n === 1 ? "" : "s"} · built {relativeTime(pack.builtAt)}
        </span>
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
      <div className={cn("border-t px-4 pt-3 pb-3.5 text-[12.8px] leading-[18px]", compact && "max-h-[45vh] overflow-auto")}>
        <div className={cn("grid gap-4", compact ? "grid-cols-1" : "md:grid-cols-2")}>
          {pack.sections.map((s) => (
            <section key={s.key} className={cn(!compact && s.key === "not_retrieved" && "md:col-span-2")}>
              <h3 className={cn("text-[11px] font-semibold tracking-wide uppercase", s.key === "not_retrieved" ? "text-warning-foreground" : "text-muted-foreground")}>{s.title}</h3>
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
                        const chip = "ml-1 inline-grid size-4 place-items-center rounded-[4px] border bg-muted align-text-bottom text-[10px] leading-none text-foreground";
                        return t.kind === "external" ? (
                          <a key={id} href={t.href} target="_blank" rel="noopener noreferrer" title={`${src.title}${src.publishedAt ? ` (${src.publishedAt.slice(0, 10)})` : ""}`} className={cn(chip, "hover:bg-primary hover:text-primary-foreground")}>
                            {num}
                          </a>
                        ) : (
                          <span key={id} title={src.title} className={chip}>
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
          <ol className="mt-4 grid gap-0.5 border-t pt-3 text-[11px] leading-4 text-muted-foreground md:grid-cols-2">
            {pack.sources.map((s, i) => {
              const t = resolveSource(s);
              const label = `${s.title}${s.publishedAt ? ` · ${s.publishedAt.slice(0, 10)}` : ""}`;
              return (
                <li key={s.id} className="flex gap-1.5">
                  <span className="tnum w-4 shrink-0 text-right">{i + 1}.</span>
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
        <p className="mt-3 text-[11px] text-muted-foreground">Evidence only, gathered by the agent. Your expectations, key questions and thesis-change criteria stay yours to write on the earnings page.</p>
      </div>
    </div>
  );
}
