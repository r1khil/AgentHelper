import Link from "next/link";
import { fmtDayMonth } from "@/lib/format";
import { OwlMark } from "@/components/app/owl-mark";

/** Something recorded since the thesis: Hoot's own note from a thread (his words, in serif), or the team's write-up. */
export type SinceItem = { key: string; by: "hoot" | "team"; text: string; label: string; at: Date | string; href?: string };

/**
 * The rail's last section: the team's thesis (`thesis`, editable), then what has been recorded since it, newest first.
 * There is no Hoot summary of "what changed" in the app, so this shows the real entries instead: Hoot's research-log
 * notes from threads about the holding and the team's latest write-up, each linking to where it came from.
 */
export function SinceThesis({ thesis, items }: { thesis: React.ReactNode; items: SinceItem[] }) {
  return (
    <section aria-labelledby="since-h" className="px-1">
      <h2 id="since-h" className="flex items-center gap-2 text-body font-semibold">
        <OwlMark className="size-5 rounded-full" />
        Since the thesis
      </h2>
      <div className="mt-3">{thesis}</div>
      {items.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-4">
          {items.map((i) => (
            <li key={i.key} className="min-w-0">
              <p className="text-caption text-muted-foreground">
                {i.href ? (
                  <Link href={i.href} className="hover:text-foreground hover:underline">
                    {i.label}
                  </Link>
                ) : (
                  i.label
                )}
                , {fmtDayMonth(i.at)}
              </p>
              <p className={i.by === "hoot" ? "mt-1 font-serif text-emph leading-relaxed text-foreground" : "mt-1 text-body leading-relaxed text-ink-2"}>{i.text}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-caption text-muted-foreground">Nothing recorded since. Hoot&apos;s notes from threads about this holding and the team&apos;s write-ups show here as they come in.</p>
      )}
    </section>
  );
}
