import { loadScope } from "@/lib/teams";
import { SellSideScreen } from "./screen";

export const metadata = { title: "Sell-side calls" };

/** Saved calls with the most recent one open. */
export default async function SellSide({ params }: { params: Promise<{ team: string }> }) {
  const scope = await loadScope((await params).team);
  return <SellSideScreen scope={scope} />;
}
