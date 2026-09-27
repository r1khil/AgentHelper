import Link from "next/link";
import { notFound } from "next/navigation";
import { loadTeam } from "@/lib/teams";
import { getCall } from "@/lib/sell-side/store";
import { getChat, loadMessages, effectiveRunStatus } from "@/lib/chats";
import { agentConfigured } from "@/lib/agent/model";
import { canOpenChat, transparencyEnabled } from "@/lib/auth";
import { CallDiscussion } from "@/components/app/sell-side/call-discussion";
import { AnalysisBrief } from "@/components/app/sell-side/analysis-brief";
import { CallWorkspace } from "@/components/app/sell-side/call-workspace";
export const metadata = { title: "Sell-side call" };
export default async function CallPage({ params }: { params: Promise<{ team: string; callId: string }> }) {
  const { team: slug, callId } = await params;
  const { team, user } = await loadTeam(slug);
  if (!/^[0-9a-f-]{36}$/i.test(callId)) notFound();
  const call = await getCall(callId);
  if (!call || call.teamId !== team.id) notFound();
  const [chat, messages] = await Promise.all([getChat(call.chatId), loadMessages(call.chatId)]);
  if (!chat) notFound();
  // Once an exec's follow-up read the price target sheet, the discussion is for execs and admins only.
  const hidden = !canOpenChat(user, chat);
  return (
    <div className="space-y-5">
      <Link className="text-sm underline" href={`/t/${team.slug}/sell-side`}>
        ← Saved calls
      </Link>
      <div>
        <h1 className="text-xl font-semibold">
          {call.ticker} · {call.title}
        </h1>
        <p className="text-sm text-muted-foreground">Transcript, structured summary, and comparison with your company files.</p>
      </div>
      <CallWorkspace callId={call.id} configured={agentConfigured()}>
        {call.status === "ready" && !hidden && <AnalysisBrief chatId={chat.id} messages={messages} />}
      </CallWorkspace>
      {hidden && <p className="text-sm text-muted-foreground">The analysis and discussion for this call are visible to execs and admins only, because they draw on the price target sheet.</p>}
      {call.status === "ready" && !hidden && (
        <CallDiscussion
          chatId={chat.id}
          initialMessages={messages}
          initialRunStatus={effectiveRunStatus(chat)}
          tickers={[call.ticker]}
          configured={agentConfigured()}
          transparency={transparencyEnabled(user)}
        />
      )}
    </div>
  );
}
