import { ModelsSkeleton } from "@/components/app/page-skeletons";

/** Models and one model: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <ModelsSkeleton />;
}
