import { notFound } from "next/navigation";
import { itemTeam, loadScope } from "@/lib/teams";
import { getCall } from "@/lib/sell-side/store";
import { SellSideScreen } from "../screen";

export const metadata = { title: "Sell-side call" };

/** Saved calls with this call open. The fund scope shows any team's call; a team scope only its own. */
export default async function CallPage({ params }: { params: Promise<{ team: string; callId: string }> }) {
  const { team: slug, callId } = await params;
  const scope = await loadScope(slug);
  if (!/^[0-9a-f-]{36}$/i.test(callId)) notFound();
  const call = await getCall(callId);
  if (!call) notFound();
  itemTeam(scope, call.teamId);
  return <SellSideScreen scope={scope} call={call} />;
}
