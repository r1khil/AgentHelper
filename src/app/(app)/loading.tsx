import { TodaySkeleton } from "@/components/app/page-skeletons";

/** Today: shown at once on navigation while the page streams in, shaped like it so nothing moves. Also the fallback for any app page without its own loading.tsx. */
export default function Loading() {
  return <TodaySkeleton />;
}
