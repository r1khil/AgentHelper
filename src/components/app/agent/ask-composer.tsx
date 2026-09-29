"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SendButton } from "@/components/app/chat/thread-parts";
import { COMPOSER_SHADOW } from "@/components/app/chat/styles";
import { cn } from "@/lib/utils";
import { useStartChat } from "./use-start-chat";

/** A scope a question can be filed under: the whole fund (no team) or one team. */
export type AskScope = { label: string; slug: string | null };
/** A holding a question can be pinned to: it opens on that holding's board. */
export type AskHolding = { ticker: string; company: string; teamSlug: string; team: string };

const CHIP = "flex h-[30px] items-center gap-1.5 rounded-md bg-secondary px-2.5 text-body text-ink-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The big question box on Home and Research: 12px radius, a 1px strong border, the soft two-layer shadow, a 17px
 * textarea, then the scope ("Whole fund ▾"), an optional holding to pin the question to, a note about where Hoot looks,
 * and a 34px send. Enter asks; Shift+Enter is a new line. Starter questions from Hoot's tour or the chips under the box
 * arrive as a `hoot:fill-ask` event and land here to edit before sending.
 */
export function AskComposer({
  scopes,
  defaultScope,
  holdings,
  placeholder,
  note,
  configured,
}: {
  scopes: AskScope[];
  /** The slug selected at first (null: the whole fund). */
  defaultScope: string | null;
  /** When given, offers "Pin to a holding ▾". */
  holdings?: AskHolding[];
  placeholder: string;
  note?: string;
  configured: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<string | null>(scopes.some((s) => s.slug === defaultScope) ? defaultScope : (scopes[0]?.slug ?? null));
  const [pinned, setPinned] = useState<AskHolding | null>(null);
  const { asking, error, start } = useStartChat();

  useEffect(() => {
    const fill = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== "string") return;
      setText(q);
      box.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hoot:fill-ask", fill);
    return () => window.removeEventListener("hoot:fill-ask", fill);
  }, []);

  const submit = async () => {
    if (!text.trim() || asking || !configured) return;
    const ok = await start(text, pinned ? { teamSlug: pinned.teamSlug, ticker: pinned.ticker } : { teamSlug: scope });
    if (ok) setText("");
  };

  return (
    <form
      data-tour="ask-hoot"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn("w-full rounded-composer border border-border-strong bg-background px-4 pt-4 pb-3 focus-within:border-foreground", COMPOSER_SHADOW)}
    >
      <label htmlFor={id} className="sr-only">
        Ask Hoot
      </label>
      <textarea
        ref={box}
        id={id}
        value={text}
        rows={2}
        disabled={asking || !configured}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={configured ? placeholder : "Hoot isn't set up yet: an admin needs to turn it on"}
        className="field-sizing-content max-h-40 min-h-[52px] w-full resize-none bg-transparent px-0.5 text-title leading-[26px] outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <ScopeChip scopes={scopes} value={pinned ? pinned.teamSlug : scope} onChange={setScope} disabled={!!pinned} />
        {holdings && holdings.length > 0 && <HoldingChip holdings={holdings} value={pinned} onChange={setPinned} />}
        {note && <span className="min-w-0 truncate text-caption text-muted-foreground">{asking ? "Opening a chat…" : note}</span>}
        <span className="flex-1" />
        <SendButton disabled={!text.trim() || asking || !configured} label="Ask" />
      </div>
      {error && (
        <div role="alert" className="mt-2 text-caption font-medium text-caution-foreground">
          {error}
        </div>
      )}
    </form>
  );
}

/** "Whole fund ▾": which team the question is filed under. A member with one team just sees its name. */
function ScopeChip({ scopes, value, onChange, disabled }: { scopes: AskScope[]; value: string | null; onChange: (slug: string | null) => void; disabled?: boolean }) {
  const current = scopes.find((s) => s.slug === value) ?? scopes[0];
  if (!current) return null;
  if (scopes.length < 2 || disabled) return <span className={CHIP}>{current.label}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Asking about ${current.label}. Change`} className={cn(CHIP, "hover:bg-border")}>
        {current.label}
        <ChevronDown className="size-2.5 text-muted-foreground" strokeWidth={2.5} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {scopes.map((s) => (
          <DropdownMenuItem key={s.slug ?? "fund"} onClick={() => onChange(s.slug)} className={cn(s.slug === current.slug && "font-semibold")}>
            <span className="min-w-0 flex-1">{s.label}</span>
            {s.slug === current.slug && <Check className="text-muted-foreground" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Pin to a holding ▾": the question opens on that holding's research board instead of a general chat. */
function HoldingChip({ holdings, value, onChange }: { holdings: AskHolding[]; value: AskHolding | null; onChange: (h: AskHolding | null) => void }) {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = holdings.filter((h) => !f || h.ticker.toLowerCase().includes(f) || h.company.toLowerCase().includes(f));
  return (
    <span className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={value ? `Pinned to ${value.ticker}. Change` : "Pin to a holding"} className={cn(CHIP, "hover:bg-border", value && "font-semibold text-foreground")}>
          {value ? value.ticker : "Pin to a holding"}
          <ChevronDown className="size-2.5 text-muted-foreground" strokeWidth={2.5} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-0">
          <div className="border-b p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Find a holding"
              aria-label="Find a holding"
              className="h-7 w-full rounded-md bg-secondary px-2 text-body outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            <DropdownMenuLabel>The question opens on its research board</DropdownMenuLabel>
            {shown.length === 0 && <p className="px-2 py-2 text-body text-muted-foreground">No holding matches.</p>}
            {shown.map((h) => (
              <DropdownMenuItem key={`${h.teamSlug}:${h.ticker}`} onClick={() => onChange(h)}>
                <span className="w-12 shrink-0 font-semibold">{h.ticker}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.company}</span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {value && (
        <button type="button" onClick={() => onChange(null)} aria-label={`Unpin ${value.ticker}`} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

/**
 * Starter questions under the box: 30px grey chips that ask at once (the box is for the question you write yourself).
 * `teamSlug` files the chat, as the box's scope does; null is the member's own team.
 */
export function PromptChips({ prompts, teamSlug, configured = true }: { prompts: string[]; teamSlug: string | null; configured?: boolean }) {
  const { asking, error, start } = useStartChat();
  if (prompts.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap justify-center gap-2">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            disabled={asking || !configured}
            onClick={() => void start(p, { teamSlug })}
            className="flex h-[30px] items-center rounded-md bg-secondary px-3 text-body text-ink-3 transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
          >
            {p}
          </button>
        ))}
      </div>
      {error && (
        <div role="alert" className="mt-2 text-center text-caption font-medium text-caution-foreground">
          {error}
        </div>
      )}
    </>
  );
}
