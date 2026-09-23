/* eslint-disable @next/next/no-html-link-for-pages -- Standalone browser test shell, not a Next route. */
// Only the routing shell is a fixture: the form, recorder, brief, source viewer and chat are production components.
import type { UIMessage } from "ai";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { NewCall } from "@/components/app/sell-side/new-call";
import { CallWorkspace } from "@/components/app/sell-side/call-workspace";
import { AnalysisBrief } from "@/components/app/sell-side/analysis-brief";
import { CallDiscussion } from "@/components/app/sell-side/call-discussion";
const teamId = "11111111-1111-4111-8111-111111111111";
type Call = {
  id: string;
  chatId: string;
  status: string;
  title: string;
  ticker: string;
};
type State = { call: Call | null; messages: UIMessage[]; calls: Call[] };
function App() {
  const [state, setState] = useState<State | null>(null);
  useEffect(() => {
    const load = async () => {
      const id = location.pathname.split("/").at(-1);
      const response = await fetch(`/test/state?id=${id}`);
      const data: State = await response.json();
      setState(data);
    };
    void load();
    window.addEventListener("navigate", load);
    return () => window.removeEventListener("navigate", load);
  }, []);
  if (!state) return <p>Loading…</p>;
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Sell-side analyzer</h1>
      {state.call ? (
        <>
          <a className="text-sm underline" href="/">
            ← Saved calls
          </a>
          <h2 className="text-xl">
            {state.call.ticker} · {state.call.title}
          </h2>
          <CallWorkspace key={state.call.id} callId={state.call.id} configured>
            {state.call.status === "ready" && <AnalysisBrief chatId={state.call.chatId} messages={state.messages} />}
          </CallWorkspace>
          {state.call.status === "ready" && (
            <CallDiscussion chatId={state.call.chatId} initialMessages={state.messages} initialRunStatus="idle" tickers={[state.call.ticker]} configured />
          )}
        </>
      ) : (
        <>
          <NewCall
            team="tech"
            teamId={teamId}
            holdings={[
              {
                id: "22222222-2222-4222-8222-222222222222",
                ticker: "AMZN",
                companyName: "Amazon",
              },
            ]}
          />
          <h2 className="font-semibold">Saved calls</h2>
          {state.calls.map((call) => (
            <a key={call.id} className="block rounded border p-4" href={`/t/tech/sell-side/${call.id}`}>
              {call.ticker} · {call.title}
            </a>
          ))}
        </>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
