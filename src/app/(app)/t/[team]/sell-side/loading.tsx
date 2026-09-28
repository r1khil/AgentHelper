import { SellSideSkeleton } from "@/components/app/page-skeletons";

/** Sell-side calls and one call: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <SellSideSkeleton />;
}
