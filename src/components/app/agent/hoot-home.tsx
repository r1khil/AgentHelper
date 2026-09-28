"use client";

import { CornerDownLeft } from "lucide-react";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";
import { chatSuggestions } from "@/components/app/chat/chat-panel";
import { Panel } from "@/components/app/panel";
import { AskHoot } from "./ask-hoot";

/**
 * The top of Research › Conversations: what Hoot does, the ask box for a general question, and starter questions
 * beside it that fill the box (so they can be edited before sending).
 */
export function AskPanel({ ticker, configured, teamSlug, scopeName }: { ticker?: string; configured: boolean; teamSlug: string | null; scopeName: string }) {
  const suggestions = chatSuggestions(ticker);
  return (
    <Panel className="shrink-0">
      <div className="grid gap-x-8 gap-y-3 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:p-5">
        <div className="flex min-w-0 gap-4">
          <HootOnPage />
          <HootSprite mood="idle" size={56} track className="-mt-1 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold tracking-[-0.015em]">What should Hoot look into?</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              Hoot pulls prices, SEC filings, financials, news, economic data and your team&rsquo;s notes, with a source on every fact.
            </p>
            {!configured && <div className="mt-3 rounded-[10px] bg-caution px-3 py-2 text-[13px] text-caution-foreground">Hoot isn&apos;t set up yet: an admin needs to turn it on.</div>}
            <AskHoot
              teamSlug={teamSlug}
              configured={configured}
              className="mt-3.5"
              hint={`A general question for ${scopeName}. For one holding, pick it from By holding below.`}
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="label-mono pb-1.5 text-muted-foreground">Try asking</div>
          {/* Beside the ask box on wide screens; one scrolling row of chips under it otherwise, to keep the boards in view. */}
          <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:mx-0 xl:flex-col xl:gap-0 xl:overflow-visible xl:px-0 xl:pb-0">
            {suggestions.map((s) => (
              <li key={s} className="shrink-0 xl:shrink">
                <button
                  type="button"
                  disabled={!configured}
                  title={s}
                  onClick={() => window.dispatchEvent(new CustomEvent("hoot:fill-ask", { detail: s }))}
                  className="group flex w-full max-w-[300px] items-center gap-2 rounded-full bg-band px-3 py-1.5 text-left text-[12.5px] leading-snug text-ink-2 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60 xl:max-w-none xl:rounded-[8px] xl:bg-transparent xl:px-2 xl:py-[7px] xl:text-[13px] xl:hover:bg-band"
                >
                  <span className="min-w-0 flex-1 truncate xl:line-clamp-2 xl:whitespace-normal">{s}</span>
                  <CornerDownLeft className="hidden size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 xl:block" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
