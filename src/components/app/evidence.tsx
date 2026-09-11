import Link from "next/link";
import { Timestamp } from "./timestamp";
import { ArrowOut } from "./icons";

/**
 * The fact/hypothesis distinction is the product's central claim
 * (docs/decisions.md:18 -- "Separate facts, calculations, and possible
 * explanations"; docs/mvp.md:52 -- "evidence proximity is not proof of
 * causation").
 *
 * It is carried by three redundant signals, never by hue alone: the left
 * border, the label, and the surface tint. Do not reduce it to colour.
 */

export function EvidenceFact({
  content,
  title,
  location,
  sourceId,
  publishedAt,
  retrievedAt,
}: {
  content: string;
  title: string;
  location: string;
  sourceId: string;
  publishedAt: Date | string | null;
  retrievedAt: Date | string | null;
}) {
  return (
    <article className="border-fact-border bg-fact-surface border-l-2 py-2 pl-4">
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
        Fact
      </div>
      <p className="text-foreground mt-0 mb-2 text-[13px] leading-relaxed">
        {content}
      </p>
      <Link
        href={`/sources/${sourceId}`}
        className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      >
        {title}
        <ArrowOut className="size-3" />
      </Link>
      <div className="text-muted-foreground mt-1 text-[11px]">
        {location} · Published <Timestamp value={publishedAt} /> · Retrieved{" "}
        <Timestamp value={retrievedAt} />
      </div>
    </article>
  );
}

export function Hypothesis({
  content,
  sourceId,
}: {
  content: string;
  sourceId: string;
}) {
  return (
    <article className="border-hypothesis-border bg-hypothesis-surface rounded-r border-l-2 py-2 pr-3 pl-4">
      <div className="text-hypothesis mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
        Hypothesis · not established causation
      </div>
      <p className="text-foreground mt-0 mb-2 text-[13px] leading-relaxed">
        {content}
      </p>
      <Link
        href={`/sources/${sourceId}`}
        className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
      >
        Related source
        <ArrowOut className="size-3" />
      </Link>
    </article>
  );
}

/**
 * Labels a region by who owns its contents. The ownership boundary in
 * docs/product.md:9-15 was previously expressed only as a footer sentence;
 * here it becomes layout.
 */
export function OwnershipRegion({
  owner,
  title,
  description,
  children,
}: {
  owner: "agent" | "analyst";
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-lg border">
      <header className="border-border border-b px-5 py-3">
        <div className="text-muted-foreground mb-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
          {owner === "agent" ? "Prepared by the agent" : "Owned by you"}
        </div>
        <h2 className="font-serif text-lg leading-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-0.5 mb-0 text-xs">
            {description}
          </p>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
