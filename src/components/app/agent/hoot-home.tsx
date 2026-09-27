"use client";

import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";
import { chatSuggestions } from "@/components/app/chat/chat-panel";

/** The empty conversation on Hoot's page: what he does, and starter questions that fill the ask box below. */
export function HootHomeIntro({ ticker, configured }: { ticker?: string; configured: boolean }) {
  const suggestions = chatSuggestions(ticker);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[600px] flex-col items-center px-6 pt-10 pb-6 text-center">
        <HootOnPage />
        <HootSprite mood="idle" size={84} track />
        <div className="mt-2 text-[17px] font-semibold tracking-[-0.015em]">Ask for evidence, not conclusions</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          Hoot pulls prices, SEC filings, financials, news, economic data and your team&rsquo;s notes, with a source on every fact. It will not write your update or thesis.
        </p>
        <div className="mt-6 grid w-full gap-2 text-left">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={!configured}
              onClick={() => window.dispatchEvent(new CustomEvent("hoot:fill-ask", { detail: s }))}
              className="rounded-[10px] bg-card px-3.5 py-2.5 text-left text-[13.5px] leading-snug shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-band disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
