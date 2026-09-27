import { notFound } from "next/navigation";
import { loadTeam } from "@/lib/teams";
import { getCall } from "@/lib/sell-side/store";
import { SellSideScreen } from "../screen";

export const metadata = { title: "Sell-side call" };

/** Saved calls with this call open. */
export default async function CallPage({ params }: { params: Promise<{ team: string; callId: string }> }) {
  const { team: slug, callId } = await params;
  const { team, user } = await loadTeam(slug);
  if (!/^[0-9a-f-]{36}$/i.test(callId)) notFound();
  const call = await getCall(callId);
  if (!call || call.teamId !== team.id) notFound();
  return <SellSideScreen scope={{ team, teamIds: team.id, teamById: new Map([[team.id, team]]), user }} call={call} />;
}
