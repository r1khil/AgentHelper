import { SectionHead } from "@/components/app/portfolio/parts";
import { Explained } from "../attribution/info-tip";

/**
 * A titled, anchor-linkable block below the fold on the Exposure page, linkable as `/exposure#<id>`.
 */
export function ExposureSection({ id, title, explain, aside, children }: { id: string; title: string; explain: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4">
      <SectionHead id={`${id}-heading`} title={<Explained label={title}>{explain}</Explained>} sub={aside} />
      <div className="mt-2">{children}</div>
    </section>
  );
}
