import { EarningsReportSkeleton } from "@/components/app/page-skeletons";

/**
 * /earnings itself only redirects to Markets now; what loads under this segment is one report (earnings/[id]), so this
 * boundary shows that page's shape rather than a calendar's. Safe to delete along with the redirect.
 */
export default function Loading() {
  return <EarningsReportSkeleton />;
}
