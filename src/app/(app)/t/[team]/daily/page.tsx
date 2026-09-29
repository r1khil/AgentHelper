import { redirect } from "next/navigation";

/** Daily is the Today period of Performance; a scope's /daily lands on its own Performance view at Today. */
export default async function TeamDailyPage({ params }: PageProps<"/t/[team]/daily">) {
  const slug = (await params).team;
  redirect(`/t/${encodeURIComponent(slug)}/performance?period=today`);
}
