import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";

/** The ledger is the Portfolio's Activity view now (its inputs keep `?tab=`). */
export default async function LedgerPage({ searchParams }: PageProps<"/attribution/ledger">) {
  redirect(withQuery("/t/fund/activity", await searchParams));
}
