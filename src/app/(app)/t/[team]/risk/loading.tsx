import { RiskSkeleton } from "@/components/app/page-skeletons";

/** Team risk: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <RiskSkeleton tabs={4} />;
}
