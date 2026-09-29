import { redirect } from "next/navigation";

/** Old link: Research's list of chats and boards is gone. Threads are in the sidebar and Home is where a question starts. */
export default function LegacyResearchPage() {
  redirect("/");
}
