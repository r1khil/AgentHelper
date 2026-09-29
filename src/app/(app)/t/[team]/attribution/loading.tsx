import { AttributionSkeleton } from "@/components/app/page-skeletons";

/** Team attribution: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <AttributionSkeleton tabs={4} />;
}
