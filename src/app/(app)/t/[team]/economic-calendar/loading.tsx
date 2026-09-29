import { MarketsSkeleton } from "@/app/(app)/markets/markets-skeleton";

/** This route redirects to Markets; while it does, show Markets' own skeleton so nothing jumps. */
export default function Loading() {
  return <MarketsSkeleton />;
}
