import { notFound, redirect } from "next/navigation";
import { loadTeam } from "@/lib/teams";
import { getChat } from "@/lib/chats";

/** Old links: general conversations now live at /hoot/<id>, which sends holding chats on to their research board. */
export default async function LegacyChatPage({ params }: { params: Promise<{ team: string; chatId: string }> }) {
  const { team: slug, chatId } = await params;
  const { team } = await loadTeam(slug);
  const chat = await getChat(chatId);
  if (!chat || chat.teamId !== team.id) notFound();
  redirect(`/hoot/${chat.id}`);
}
