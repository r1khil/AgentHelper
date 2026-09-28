import { CalendarSkeleton } from "@/components/app/page-skeletons";

/** The economic calendar: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <CalendarSkeleton />;
}
