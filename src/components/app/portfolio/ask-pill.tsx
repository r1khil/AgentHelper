"use client";

import { useId, useState } from "react";
import { useStartChat } from "@/components/app/agent/use-start-chat";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { cn } from "@/lib/utils";

/**
 * "Ask about the portfolio": a one-line question box with Hoot's face. Enter opens a thread filed under the scope in
 * view (the whole fund, or the team) and goes there, the same way Home's box does.
 */
export function AskPill({ teamSlug, placeholder = "Ask about the portfolio", configured = true }: { teamSlug: string | null; placeholder?: string; configured?: boolean }) {
  const id = useId();
  const [text, setText] = useState("");
  const { asking, error, start } = useStartChat();
  const submit = async () => {
    if (!text.trim() || asking || !configured) return;
    if (await start(text, { teamSlug })) setText("");
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={cn("flex h-[46px] items-center gap-2.5 rounded-full border bg-surface pr-2 pl-3.5 transition-colors focus-within:border-foreground", asking && "opacity-70")}
      >
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={asking || !configured}
          placeholder={configured ? placeholder : "Hoot isn't set up yet"}
          className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!text.trim() || asking || !configured}
          aria-label="Ask Hoot"
          className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
        >
          <HootSprite mood={asking ? "thinking" : "idle"} size={28} />
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1.5 px-3.5 text-caption font-medium text-caution-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
