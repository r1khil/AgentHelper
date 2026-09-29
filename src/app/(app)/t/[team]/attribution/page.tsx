import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";

/** A team's attribution is its Portfolio's Performance view now, period and all. */
export default async function TeamAttributionPage({ params, searchParams }: PageProps<"/t/[team]/attribution">) {
  const [{ team }, query] = await Promise.all([params, searchParams]);
  redirect(withQuery(`/t/${encodeURIComponent(team)}/performance`, query));
}
