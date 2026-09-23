import { notFound } from "next/navigation";
import { HootHero } from "@/components/app/hoot/hoot-hero";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import type { HootMood } from "@/lib/hoot/types";

const MOODS: HootMood[] = ["idle", "wave", "thinking", "alert", "concerned", "happy", "sleepy"];

/** Development only: every Hoot pose and the live 3D hero, for tuning renders from scripts/blender/hoot.py. */
export default function HootGallery() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <section>
        <h1 className="text-lg font-semibold">Hoot</h1>
        <p className="text-sm text-muted-foreground">Sprites watch the pointer, the caret, clicks and scrolling, and blink; they close their eyes for passwords. The 3D hero does the same, tilts his head, fluffs up now and then, and hops when clicked.</p>
      </section>
      <section className="flex flex-wrap items-end gap-8">
        {MOODS.map((m) => (
          <figure key={m} className="text-center">
            <HootSprite mood={m} size={112} track bob />
            <figcaption className="mt-1 text-xs text-muted-foreground">{m}</figcaption>
          </figure>
        ))}
      </section>
      <section className="flex items-end gap-10">
        <HootHero size={240} />
        <div className="flex items-end gap-6">
          {[28, 40, 52, 64].map((s) => (
            <HootSprite key={s} mood="idle" size={s} track />
          ))}
        </div>
      </section>
    </main>
  );
}
