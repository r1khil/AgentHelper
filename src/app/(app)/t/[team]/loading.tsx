import { HoldingsSkeleton } from "@/components/app/page-skeletons";

/** Holdings (and any team page without its own): shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <HoldingsSkeleton />;
}
