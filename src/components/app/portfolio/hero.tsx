import { PageHero } from "@/components/app/page-head";
import { toneClass, type Tone } from "./parts";

/**
 * The one big number that opens a page (the foundation's PageHero), its figure coloured by sign when it is a gain or a
 * loss, with `aside` at the right, level with the line under it: a data note, or a switch.
 */
export function Hero({ label, value, tone, change, note, aside }: { label: React.ReactNode; value: React.ReactNode; tone?: Tone; change?: React.ReactNode; note?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-10">
      <PageHero className="min-w-0 flex-1" label={label} value={<span className={toneClass(tone)}>{value}</span>} change={change} note={note} />
      {aside}
    </div>
  );
}
