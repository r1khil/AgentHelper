import { WeeklySkeleton } from "@/components/app/page-skeletons";

/** The weekly update, latest or any week: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <WeeklySkeleton />;
}
