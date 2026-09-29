import { ThreadSkeleton } from "@/app/(app)/hoot/[chatId]/thread-skeleton";

/** An old chat link, on its way to the thread: shaped like it so nothing moves. */
export default function Loading() {
  return <ThreadSkeleton />;
}
