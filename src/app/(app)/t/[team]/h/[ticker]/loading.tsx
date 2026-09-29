import { HoldingPageSkeleton } from "@/components/app/holdings/holding-skeleton";

/** A holding: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <HoldingPageSkeleton />;
}
