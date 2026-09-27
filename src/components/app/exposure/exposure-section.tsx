import { Explained } from "../attribution/info-tip";

/**
 * A titled, anchor-linkable block below the fold on the Exposure page, linkable as `/exposure#<id>`.
 */
export function ExposureSection({ id, title, explain, aside, children }: { id: string; title: string; explain: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-4">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[14.5px] font-semibold"><Explained label={title}>{explain}</Explained></h2>
        {aside && <div className="text-[12.5px] text-muted-foreground">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
