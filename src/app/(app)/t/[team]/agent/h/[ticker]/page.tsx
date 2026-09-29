import { redirect } from "next/navigation";

/**
 * Old link to a holding's research board: one of its chats (`?chat=`) is a thread at /hoot/<id> now, and the board
 * itself became the holding page's Threads tab.
 */
export default async function LegacyHoldingBoardPage({ params, searchParams }: { params: Promise<{ team: string; ticker: string }>; searchParams: Promise<{ chat?: string }> }) {
  const [{ team, ticker }, { chat }] = await Promise.all([params, searchParams]);
  if (chat) redirect(`/hoot/${encodeURIComponent(chat)}`);
  redirect(`/t/${encodeURIComponent(team)}/h/${encodeURIComponent(ticker)}?tab=threads`);
}
