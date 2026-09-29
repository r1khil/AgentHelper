import { ExposureSkeleton } from "@/components/app/page-skeletons";

/** Team exposure: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <ExposureSkeleton tabs={4} />;
}
