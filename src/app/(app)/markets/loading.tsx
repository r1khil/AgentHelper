import { MarketsSkeleton } from "./markets-skeleton";

/** Markets: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <MarketsSkeleton />;
}
