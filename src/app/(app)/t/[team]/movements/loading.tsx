import { MovementsSkeleton } from "@/components/app/page-skeletons";

/** Movements and one movement: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <MovementsSkeleton />;
}
