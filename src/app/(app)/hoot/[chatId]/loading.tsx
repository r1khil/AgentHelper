import { ResearchWorkspaceSkeleton } from "@/components/app/page-skeletons";

/** A Hoot conversation: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <ResearchWorkspaceSkeleton />;
}
