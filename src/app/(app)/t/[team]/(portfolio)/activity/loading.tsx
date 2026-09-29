import { ActivitySkeleton } from "@/components/app/portfolio/view-skeletons";

/** Activity, under the Portfolio's header and hero (which stay on screen): shaped like the view so nothing moves. */
export default function Loading() {
  return <ActivitySkeleton />;
}
