import { redirect } from "next/navigation";

/** Daily is the Today period of the Portfolio's Performance view; bookmarks, emails and Hoot's links to /daily land there. */
export default function DailyPage() {
  redirect("/t/fund/performance?period=today");
}
