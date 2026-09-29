"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SendButton } from "@/components/app/chat/thread-parts";
import { cn } from "@/lib/utils";
import { useStartChat } from "./use-start-chat";

/** A scope a question can be filed under: the whole fund (no team) or one team. */
export type AskScope = { label: string; slug: string | null };
/** A holding a question can be pinned to: its thread lists on that holding's page. */
export type AskHolding = { ticker: string; company: string; teamSlug: string; team: string };

const CHIP = "flex h-[30px] items-center gap-1.5 rounded-lg border border-border px-3 text-body text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** What the questions under the box share with it: the scope picked in the box, and one way to start a thread. */
const AskBoxContext = createContext<{ ask: (q: string) => void; disabled: boolean } | null>(null);

/**
 * The big question box on Home: one raised card (the surface fill, a hairline border, 16px corners) holding a 15px
 * textarea, the scope ("Whole fund ▾"), an optional holding to pin the question to, a note about where Hoot looks and
 * the round send. Enter asks; Shift+Enter is a new line. `questions` sit under a hairline inside the same card (see
 * AskQuestions) and ask at once, filed under the scope picked above them. Starter questions from Hoot's tour arrive as
 * a `hoot:fill-ask` event and land in the box to edit before sending.
 */
export function AskComposer({
  scopes,
  defaultScope,
  holdings,
  placeholder,
  note,
  configured,
  questions,
  autoFocus = false,
}: {
  scopes: AskScope[];
  /** The slug selected at first (null: the whole fund). */
  defaultScope: string | null;
  /** When given, offers "Pin to a holding ▾". */
  holdings?: AskHolding[];
  placeholder: string;
  note?: string;
  configured: boolean;
  /** Questions to ask at once, under the box (AskQuestions); may stream in. */
  questions?: ReactNode;
  /** Put the cursor in the box on load (Home, where the sidebar's "New" lands). */
  autoFocus?: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [scope, setScope] = useState<string | null>(scopes.some((s) => s.slug === defaultScope) ? defaultScope : (scopes[0]?.slug ?? null));
  const [pinned, setPinned] = useState<AskHolding | null>(null);
  const { asking, error, start } = useStartChat();

  useEffect(() => {
    if (autoFocus && configured) box.current?.focus({ preventScroll: true });
  }, [autoFocus, configured]);

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
  const shared = { ask: (q: string) => void start(q, { teamSlug: scope }), disabled: asking || !configured };

  return (
    <form
      data-tour="ask-hoot"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full overflow-hidden rounded-2xl border bg-surface transition-colors focus-within:border-border-strong"
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
        className="field-sizing-content block max-h-40 min-h-[64px] w-full resize-none bg-transparent px-5 pt-[18px] text-emph leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-3">
        <ScopeChip scopes={scopes} value={pinned ? pinned.teamSlug : scope} onChange={setScope} disabled={!!pinned} />
        {holdings && holdings.length > 0 && <HoldingChip holdings={holdings} value={pinned} onChange={setPinned} />}
        {note && <span className="min-w-0 truncate pl-1 text-caption text-muted-foreground">{asking ? "Opening a thread…" : note}</span>}
        <span className="flex-1" />
        <SendButton disabled={!text.trim() || asking || !configured} label="Ask" size="round" />
      </div>
      {error && (
        <div role="alert" className="px-5 pb-3 text-caption font-medium text-caution-foreground">
          {error}
        </div>
      )}
      {questions && <AskBoxContext.Provider value={shared}>{questions}</AskBoxContext.Provider>}
    </form>
  );
}

/**
 * The questions inside the ask card, under a hairline: a grey label ("Ask about today"), then one 44px row per question
 * with a search glyph. A row asks at once, in the scope picked in the box, and opens the thread.
 */
export function AskQuestions({ label, prompts }: { label: string; prompts: string[] }) {
  const box = useContext(AskBoxContext);
  if (!box || prompts.length === 0) return null;
  return (
    <div className="border-t py-1.5">
      <div className="px-5 pt-2.5 pb-1 text-caption text-muted-foreground">{label}</div>
      <ul>
        {prompts.map((p) => (
          <li key={p}>
            <button
              type="button"
              disabled={box.disabled}
              onClick={() => box.ask(p)}
              className="flex min-h-11 w-full items-center gap-3.5 px-5 py-2 text-left text-emph transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-60"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
              <span className="min-w-0">{p}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Whole fund ▾": which team the question is filed under. A member with one team just sees its name. */
function ScopeChip({ scopes, value, onChange, disabled }: { scopes: AskScope[]; value: string | null; onChange: (slug: string | null) => void; disabled?: boolean }) {
  const current = scopes.find((s) => s.slug === value) ?? scopes[0];
  if (!current) return null;
  if (scopes.length < 2 || disabled) return <span className={CHIP}>{current.label}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Asking about ${current.label}. Change`} className={cn(CHIP, "hover:bg-secondary")}>
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

/** "Pin to a holding ▾": the question's thread is filed under that holding (its page lists it) instead of the team. */
function HoldingChip({ holdings, value, onChange }: { holdings: AskHolding[]; value: AskHolding | null; onChange: (h: AskHolding | null) => void }) {
  const [q, setQ] = useState("");
  const f = q.trim().toLowerCase();
  const shown = holdings.filter((h) => !f || h.ticker.toLowerCase().includes(f) || h.company.toLowerCase().includes(f));
  return (
    <span className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={value ? `Pinned to ${value.ticker}. Change` : "Pin to a holding"} className={cn(CHIP, "hover:bg-secondary", value && "font-semibold")}>
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
            <DropdownMenuLabel>The thread is filed under this holding</DropdownMenuLabel>
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
