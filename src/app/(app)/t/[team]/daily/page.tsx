import { redirect } from "next/navigation";
import { FUND_SCOPE_SLUG } from "@/lib/constants";

/** Daily is now the Today period of Performance; a team's /daily lands on its own Performance page at Today. */
export default async function TeamDailyPage({ params }: PageProps<"/t/[team]/daily">) {
  const slug = (await params).team;
  redirect(slug === FUND_SCOPE_SLUG ? "/attribution?period=today" : `/t/${slug}/attribution?period=today`);
}
