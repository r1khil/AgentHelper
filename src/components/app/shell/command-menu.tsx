"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { ArrowRight, Briefcase, CalendarDays, ChartColumn, Clock, Eye, Layers, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { holdingHref, scopeSlugFromPath } from "@/lib/scope";
import { markScopeIntent } from "./scope-intent";
import type { CommandHolding, RecentChat } from "@/lib/nav-data";
import { fmtChangeBp, fmtChangePct, fmtCurrency, fmtDay, fmtPct, ppToBp } from "@/lib/format";
import { parseHootCommand } from "@/lib/hoot/commands";
import { suggestionsFor, tickerFromPath } from "@/lib/hoot/policy";
import { isMac } from "@/lib/hoot/shortcuts";
import { pageContextLabel } from "@/lib/agent/page-context";
import { cn } from "@/lib/utils";
import { useHootCommand } from "../hoot/use-hoot-command";
import { useAskHoot } from "../hoot/use-ask-hoot";
import { pageContextFor, pageLabelFor } from "../hoot/page-context";
import { OwlMark } from "../owl-mark";
import { commandGroups, recentWhen, typedQuestionTarget, type CommandItem as Item, type CommandPage, type CommandScope } from "./command-groups";

const shortDate = (iso: string) => fmtDay(iso);

/**
 * The palette on every page, in two modes. ⌘J ("ask") is Hoot's palette, scoped to the page: with
 * nothing typed it offers questions about the page, recent answers and a few pages. ⌘K ("search") jumps to a holding
 * or page first, with a preview. Both send typed text to Hoot as a question or a command ("take me to holdings", "turn
 * on light mode"). Enter opens what the query names (a holding, page, scope or theme) and otherwise asks Hoot;
 * ⌘/Ctrl+Enter or Tab always asks. Hoot's corner button opens the ask mode.
 */
export function CommandMenu({
  open,
  onOpenChange,
  mode = "search",
  holdings,
  pages,
  scopes,
  recent = [],
  scopeLabel,
  pathname,
  teamSlug,
  scopeSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "ask" | "search";
  holdings: CommandHolding[];
  pages: CommandPage[];
  scopes: CommandScope[];
  recent?: RecentChat[];
  /** The scope in view, as the chip beside the box says it: "Whole fund", "Healthcare". */
  scopeLabel?: string;
  pathname: string;
  /** The scope in view, for questions not about one holding. */
  teamSlug: string | null;
  /** The scope in view (the fund's slug or a team's); holdings and boards open there. */
  scopeSlug: string | null;
}) {
  const router = useRouter();
  const runCommand = useHootCommand();
  const { asking, ask: askHoot } = useAskHoot();
  const { resolvedTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  /** The member took the page off the question: ask about the whole app instead. */
  const [wholeApp, setWholeApp] = useState(false);

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSelected("");
      setWholeApp(false);
    }
  }

  // On a holding page a typed question is about that holding, unless the member asked about the whole app.
  const onPage = !wholeApp;
  const pageTicker = onPage ? tickerFromPath(pathname) : null;
  const pageTeamSlug = onPage ? scopeSlugFromPath(pathname) : null;
  // What the page is called ("Overview", "AVGO"), read when the palette opens.
  const pageLabel = open ? pageLabelFor(pathname) : "";
  const groups = useMemo(
    () =>
      commandGroups({
        query,
        holdings,
        pages,
        scopes,
        teamSlug,
        scopeSlug,
        dark: resolvedTheme === "dark",
        pageTicker,
        pageTeamSlug,
        suggestions: suggestionsFor(onPage ? pathname : "/", pageTicker),
        mode,
        pageLabel: onPage ? pageLabel : undefined,
        recent,
      }),
    [query, holdings, pages, scopes, teamSlug, scopeSlug, resolvedTheme, pageTicker, pageTeamSlug, pathname, mode, pageLabel, recent, onPage],
  );
  const all = groups.flatMap((g) => g.items);
  // Enter runs the first item (the Enter rule lives in commandGroups) until the member arrows elsewhere.
  const current = all.find((i) => i.id === selected) ?? all[0] ?? null;
  // Pages that describe themselves (attribution, backtesting) go along with the question; say so beside it.
  const onScreen = open && onPage ? pageContextFor(pathname) : null;
  const seeing = onScreen && onScreen.kind !== "page" ? pageContextLabel(onScreen) : null;
  const mod = isMac() ? "⌘" : "Ctrl ";

  const close = () => onOpenChange(false);

  const ask = async (text: string, ticker: string | null, slug: string | null) => {
    const q = text.trim();
    if (!q || asking) return;
    // Hoot's commands ("take me to holdings", "turn on light mode") run here, without a chat.
    if (runCommand(q)) return close();
    if (await askHoot(q, { teamSlug: slug, ticker }, { withPage: onPage })) close();
  };

  /** ⌘/Ctrl+Enter and Tab: whatever is typed goes to Hoot, about the highlighted holding if there is one. */
  const askTyped = () => {
    if (current?.kind === "holding") return void ask(query, current.holding.ticker, current.holding.teamSlug);
    const to = typedQuestionTarget({ teamSlug, pageTicker, pageTeamSlug });
    void ask(query, to.ticker, to.teamSlug);
  };

  const run = (item: Item) => {
    switch (item.kind) {
      case "holding":
        close();
        router.push(holdingHref(scopeSlug, item.holding.teamSlug, item.holding.ticker));
        return;
      case "page":
        close();
        router.push(item.page.href);
        return;
      case "recent":
        close();
        router.push(item.chat.href);
        return;
      case "scope":
        close();
        markScopeIntent();
        router.push(item.scope.href);
        return;
      case "theme":
        runCommand(`switch to ${item.theme} mode`);
        close();
        return;
      case "suggest":
        // Fills the box to edit; Enter then asks.
        setQuery(item.text);
        setSelected("");
        return;
      case "ask":
        void ask(item.text, item.ticker, item.teamSlug);
    }
  };

  const askMode = mode === "ask";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[rgb(10_10_10/0.28)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Popup
          aria-label={askMode ? "Ask Hoot" : "Search"}
          className={cn(
            "fixed top-[120px] left-1/2 z-50 flex max-h-[calc(100dvh-160px)] -translate-x-1/2 flex-col overflow-hidden rounded-composer bg-popover text-popover-foreground shadow-[0_24px_60px_rgb(10_10_10/0.28),0_2px_6px_rgb(10_10_10/0.08)] outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-opacity motion-safe:duration-150 dark:shadow-[0_24px_60px_rgb(0_0_0/0.6),0_0_0_1px_var(--border)]",
            askMode ? "w-[min(640px,calc(100vw-32px))]" : "w-[min(800px,calc(100vw-32px))]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{askMode ? "Ask Hoot" : "Search"}</DialogPrimitive.Title>
          <Command
            shouldFilter={false}
            loop
            value={current?.id ?? ""}
            onValueChange={setSelected}
            className="flex min-h-0 flex-1 flex-col"
            onKeyDown={(e) => {
              // ⌘/Ctrl+Enter or Tab turns whatever is typed into a question for Hoot (preventDefault skips cmdk's Enter).
              const askKey = (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) || (e.key === "Tab" && !e.shiftKey);
              if (askKey) {
                e.preventDefault();
                askTyped();
              }
            }}
          >
            <div className="flex h-[60px] shrink-0 items-center gap-3 border-b px-[18px]">
              {askMode ? <OwlMark className="size-[30px] rounded-full" /> : <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />}
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                aria-label={askMode ? "Ask Hoot, or go to a page or holding" : "Search pages and holdings, or ask Hoot"}
                placeholder={askMode ? "Ask Hoot, or go to a page or holding" : "Search pages and holdings, or ask Hoot"}
                className="h-full min-w-0 flex-1 bg-transparent text-title outline-none placeholder:text-muted-foreground"
              />
              {askMode && onPage && pageLabel && (
                <span className="flex h-[26px] max-w-[45%] shrink-0 items-center gap-1.5 rounded-lg bg-secondary pr-1 pl-2 text-caption text-ink-3">
                  <span className="truncate">
                    {pageLabel}
                    {scopeLabel && scopeLabel !== pageLabel ? `, ${scopeLabel}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setWholeApp(true)}
                    aria-label="Ask about the whole app instead"
                    title="Ask about the whole app instead"
                    className="grid size-4 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-2.5" strokeWidth={2.5} />
                  </button>
                </span>
              )}
              {!askMode && <kbd className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-caption text-muted-foreground">esc</kbd>}
            </div>
            <div className={cn("grid min-h-0 flex-1 grid-cols-1", !askMode && "md:grid-cols-[minmax(0,1fr)_280px]")}>
              <Command.List className="max-h-[440px] min-h-0 overflow-y-auto px-2 pt-2 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group]+[cmdk-group]_[cmdk-group-heading]]:pt-3">
                <Command.Empty className="px-3 py-8 text-center text-body text-muted-foreground">Nothing matches. Press {mod}↵ to ask Hoot instead.</Command.Empty>
                {groups.map((g) => (
                  <Command.Group key={g.label} heading={<span className="text-caption font-semibold text-muted-foreground">{g.label}</span>}>
                    {g.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => run(item)}
                        className="flex h-[38px] cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-body data-[selected=true]:bg-secondary"
                      >
                        <ItemRow item={item} ask={askMode} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
              {!askMode && (
                <aside className="hidden border-l bg-band p-5 md:block" aria-live="polite">
                  {current && <Preview item={current} seeing={seeing} />}
                </aside>
              )}
            </div>
            <div className="flex h-10 shrink-0 items-center gap-4 border-t bg-band px-[18px] text-caption whitespace-nowrap text-muted-foreground">
              <span>
                <kbd className="font-mono">↑↓</kbd> move
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> {current?.kind === "ask" || current?.kind === "suggest" ? "ask" : "open"}
              </span>
              {!askMode && (
                <span>
                  <kbd className="font-mono">{mod}↵</kbd> ask Hoot
                </span>
              )}
              <span>
                <kbd className="font-mono">esc</kbd> close
              </span>
              <span className="min-w-0 flex-1" />
              <span className="hidden min-w-0 truncate sm:inline">{asking ? "Opening a chat with Hoot…" : "Hoot finds and cites the evidence. The conclusions stay yours."}</span>
            </div>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ItemRow({ item, ask }: { item: Item; ask: boolean }) {
  const icon = "size-[15px] shrink-0 text-muted-foreground";
  switch (item.kind) {
    case "holding":
      return (
        <>
          <Briefcase className={icon} strokeWidth={1.8} />
          <span className="font-semibold">{item.holding.ticker}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {item.holding.company}, {item.holding.team}
          </span>
          <span className="text-caption text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100">↵</span>
        </>
      );
    case "ask":
    case "suggest":
      return (
        <>
          <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          <span className="min-w-0 flex-1 truncate">{item.text}</span>
          <kbd className="font-mono text-caption text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100">{item.kind === "ask" || ask ? "↵ ask" : "↵"}</kbd>
        </>
      );
    case "recent":
      return (
        <>
          <Clock className={icon} strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate">{item.chat.title}</span>
          <span className="shrink-0 text-caption text-muted-foreground">{recentWhen(item.chat)}</span>
        </>
      );
    case "page":
      return (
        <>
          <PageIcon label={item.page.label} />
          <span className="shrink-0">{item.page.label}</span>
          <span className="min-w-0 flex-1" />
          {item.page.hint && <span className="min-w-0 truncate text-caption text-muted-foreground">{item.page.hint}</span>}
        </>
      );
    case "scope":
      return (
        <>
          <Layers className={icon} strokeWidth={1.8} />
          <span className="min-w-0 flex-1 truncate">Switch scope to {item.scope.label}</span>
        </>
      );
    case "theme":
      return (
        <>
          {item.theme === "dark" ? <Moon className={icon} strokeWidth={1.8} /> : <Sun className={icon} strokeWidth={1.8} />}
          <span className="min-w-0 flex-1 truncate">Switch to {item.theme} mode</span>
        </>
      );
  }
}

function PageIcon({ label }: { label: string }) {
  const cls = "size-[15px] shrink-0 text-muted-foreground";
  if (/markets|earnings/i.test(label)) return <CalendarDays className={cls} strokeWidth={1.8} />;
  if (/portfolio|performance|activity|risk|exposure|what if/i.test(label)) return <ChartColumn className={cls} strokeWidth={1.8} />;
  return <ArrowRight className={cls} strokeWidth={1.8} />;
}

function Preview({ item, seeing }: { item: Item; seeing: string | null }) {
  if (item.kind === "holding") return <HoldingPreview holding={item.holding} />;
  const command = item.kind === "ask" && parseHootCommand(item.text);
  if (item.kind === "recent") return <div><div className="text-emph font-semibold">{item.chat.title}</div><p className="mt-1.5 text-body text-muted-foreground">Reopens this chat with Hoot.</p></div>;
  const [title, body] = command
    ? ["Hoot", "Does this right away. No chat is opened."]
    : item.kind === "ask"
      ? ["Ask Hoot", `Opens a thread${item.ticker ? ` about ${item.ticker}` : ""} and sends this question. Hoot cites a source for every fact.`]
      : item.kind === "suggest"
        ? ["Suggested question", "Puts it in the box so you can edit it. Enter then asks Hoot."]
        : item.kind === "page"
          ? [item.page.label, item.page.hint ?? "Open this page."]
          : item.kind === "scope"
            ? [item.scope.label, "The Portfolio and its views follow the scope. You stay on the same kind of page."]
            : [`${item.theme === "dark" ? "Dark" : "Light"} mode`, "Remembered in this browser."];
  return (
    <div>
      <div className="text-emph font-semibold">{title}</div>
      <p className="mt-1.5 text-body leading-relaxed text-muted-foreground">{body}</p>
      {seeing && !command && (item.kind === "ask" || item.kind === "suggest") && (
        <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-caption text-muted-foreground">
          <Eye className="size-3 shrink-0" aria-hidden />
          <span className="truncate">Hoot can see: {seeing}</span>
        </p>
      )}
    </div>
  );
}

type Quote = { price: number | null; currency: string | null; changePct: number | null; relativePp: number | null };

/** Quotes fetched for the preview this session, so arrowing back and forth doesn't refetch. */
const quoteCache = new Map<string, Quote>();

function HoldingPreview({ holding: h }: { holding: CommandHolding }) {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (quoteCache.has(h.ticker)) return;
    const ctrl = new AbortController();
    // Wait a beat so arrowing through the list doesn't fire a request per row.
    const t = window.setTimeout(() => {
      fetch(`/api/nav?quote=${encodeURIComponent(h.ticker)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((q: Quote | null) => {
          if (!q) return;
          quoteCache.set(h.ticker, q);
          rerender((n) => n + 1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [h.ticker]);
  const q = quoteCache.get(h.ticker);
  const rows: [string, React.ReactNode, string?][] = [
    ["Weight", h.weightPct != null ? `${fmtPct(h.weightPct, 1)} of NAV` : "—"],
    ["vs S&P, last session", q?.relativePp != null ? fmtChangeBp(ppToBp(q.relativePp)) : "—", q?.relativePp == null ? undefined : q.relativePp >= 0 ? "text-up" : "text-down"],
    ["Next report", h.nextReport ? `${shortDate(h.nextReport)}${h.nextReportEstimated ? " (est.)" : ""}` : "—"],
    ["Open items", h.openMovement ? "Movement write-up open" : "None", h.openMovement ? "font-semibold text-caution-foreground" : undefined],
  ];
  return (
    <div>
      <div className="text-title font-bold">{h.ticker}</div>
      <div className="text-body text-muted-foreground">
        {h.company}, {h.team}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="figure text-display">{fmtCurrency(q?.price, q?.currency)}</span>
        {q?.changePct != null && <span className={cn("text-body font-semibold", q.changePct >= 0 ? "text-up" : "text-down")}>{fmtChangePct(q.changePct)}</span>}
      </div>
      <dl className="mt-4 border-t">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-row py-2 text-body">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("text-right", cls)}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
