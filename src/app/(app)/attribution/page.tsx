import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";

/** Performance is a view of the Portfolio now; bookmarks, emails and Hoot's links land there with their period. */
export default async function AttributionPage({ searchParams }: PageProps<"/attribution">) {
  redirect(withQuery("/t/fund/performance", await searchParams));
}
