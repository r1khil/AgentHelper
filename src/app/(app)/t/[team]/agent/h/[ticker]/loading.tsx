import { ResearchBoardSkeleton } from "@/components/app/page-skeletons";

/** A holding's research board: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <ResearchBoardSkeleton />;
}
