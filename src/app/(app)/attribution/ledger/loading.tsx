import { LedgerSkeleton } from "@/components/app/page-skeletons";

/** The ledger: shown at once on navigation while the page streams in, shaped like it so nothing moves. */
export default function Loading() {
  return <LedgerSkeleton />;
}
