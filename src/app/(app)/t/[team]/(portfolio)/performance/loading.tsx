import { PerformanceSkeleton } from "@/components/app/portfolio/view-skeletons";

/** Performance, under the Portfolio's header and hero (which stay on screen): shaped like the view so nothing moves. */
export default function Loading() {
  return <PerformanceSkeleton />;
}
