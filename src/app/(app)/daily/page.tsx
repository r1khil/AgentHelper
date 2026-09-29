import { redirect } from "next/navigation";

/** Daily is now the Today period of Performance; bookmarks, emails and Hoot's links to /daily land there. */
export default function DailyPage() {
  redirect("/attribution?period=today");
}
