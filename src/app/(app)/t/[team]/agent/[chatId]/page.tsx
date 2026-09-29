import { redirect } from "next/navigation";

/** Old link: every chat is a thread at /hoot/<id>, which checks who may open it. */
export default async function LegacyChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  redirect(`/hoot/${encodeURIComponent(chatId)}`);
}
