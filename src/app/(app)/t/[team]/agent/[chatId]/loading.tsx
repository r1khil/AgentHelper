import { ThreadSkeleton } from "@/components/app/page-skeletons";

/** An old chat link, on its way to the conversation: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <ThreadSkeleton />;
}
