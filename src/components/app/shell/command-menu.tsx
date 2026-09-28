"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { ArrowRight, Briefcase, CalendarDays, ChartColumn, Eye, Layers, MessageSquareText, Moon, Search, Sparkles, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { holdingHref, scopeSlugFromPath } from "@/lib/scope";
import { markScopeIntent } from "./scope-intent";
import type { CommandHolding } from "@/lib/nav-data";
import { fmtBp, fmtCurrency, fmtDay, fmtPct, ppToBp } from "@/lib/format";
import { parseHootCommand } from "@/lib/hoot/commands";
import { suggestionsFor, tickerFromPath } from "@/lib/hoot/policy";
import { isMac } from "@/lib/hoot/shortcuts";
import { pageContextLabel } from "@/lib/agent/page-context";
import { cn } from "@/lib/utils";
import { useHootCommand } from "../hoot/use-hoot-command";
import { useAskHoot } from "../hoot/use-ask-hoot";
import { pageContextFor } from "../hoot/page-context";
import { OwlMark } from "../owl-mark";
import { commandGroups, typedQuestionTarget, type CommandItem as Item, type CommandPage, type CommandScope } from "./command-groups";

const shortDate = (iso: string) => fmtDay(iso);

/**
 * ⌘K, the one place to ask Hoot outside Research: jump to a holding or page, run a quick action, or send the text to
 * Hoot as a question or a command ("take me to holdings", "turn on light mode"). Enter opens what the query names
 * (a holding, page, scope or theme) and otherwise asks Hoot; ⌘/Ctrl+Enter or Tab always asks. The docked Hoot's
 * panel opens this too.
 */
export function CommandMenu({
  open,
  onOpenChange,
  holdings,
  pages,
  scopes,
  pathname,
  teamSlug,
  scopeSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holdings: CommandHolding[];
  pages: CommandPage[];
  scopes: CommandScope[];
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

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSelected("");
    }
  }

  // On a holding page a typed question goes to that holding's research, as it did from the companion.
  const pageTicker = tickerFromPath(pathname);
  const pageTeamSlug = scopeSlugFromPath(pathname);
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
        suggestions: suggestionsFor(pathname, pageTicker),
      }),
    [query, holdings, pages, scopes, teamSlug, scopeSlug, resolvedTheme, pageTicker, pageTeamSlug, pathname],
  );
  const all = groups.flatMap((g) => g.items);
  // Enter runs the first item (the Enter rule lives in commandGroups) until the member arrows elsewhere.
  const current = all.find((i) => i.id === selected) ?? all[0] ?? null;
  // Pages that describe themselves (attribution, backtesting) go along with the question; say so beside it.
  const onScreen = open ? pageContextFor(pathname) : null;
  const seeing = onScreen && onScreen.kind !== "page" ? pageContextLabel(onScreen) : null;
  const mod = isMac() ? "⌘" : "Ctrl ";

  const close = () => onOpenChange(false);

  const ask = async (text: string, ticker: string | null, slug: string | null) => {
    const q = text.trim();
    if (!q || asking) return;
    // Hoot's commands ("take me to holdings", "turn on light mode") run here, without a chat.
    if (runCommand(q)) return close();
    if (await askHoot(q, { teamSlug: slug, ticker })) close();
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

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[oklch(0.23_0.01_60/0.5)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-opacity motion-safe:duration-150" />
        <DialogPrimitive.Popup
          aria-label="Search and ask Hoot"
          className="fixed top-[88px] left-1/2 z-50 flex max-h-[calc(100dvh-120px)] w-[min(800px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[18px] bg-card text-card-foreground shadow-[0_24px_64px_-12px_rgba(40,25,10,0.35),0_0_0_1px_var(--border)] outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-opacity motion-safe:duration-150"
        >
          <DialogPrimitive.Title className="sr-only">Search and ask Hoot</DialogPrimitive.Title>
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
            <div className="flex h-[58px] shrink-0 items-center gap-3 border-b px-5">
              <Search className="size-[18px] shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Ask Hoot, or jump to a holding or page"
                className="h-full min-w-0 flex-1 bg-transparent text-title outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded-full bg-muted px-2 py-0.5 font-mono text-caption text-muted-foreground">esc</kbd>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
              <Command.List className="max-h-[440px] min-h-0 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5">
                <Command.Empty className="px-3 py-8 text-center text-body text-muted-foreground">Nothing matches. Press {mod}↵ to ask Hoot instead.</Command.Empty>
                {groups.map((g) => (
                  <Command.Group
                    key={g.label}
                    heading={
                      <span className="label-mono flex items-center gap-1.5 text-caption text-muted-foreground">
                        {g.label === "Ask Hoot" && <OwlMark className="size-3.5" />}
                        {g.label}
                      </span>
                    }
                  >
                    {g.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => run(item)}
                        className="flex h-[38px] cursor-pointer items-center gap-3 rounded-[10px] px-3 text-emph data-[selected=true]:bg-band"
                      >
                        <ItemRow item={item} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
              <aside className="hidden border-l bg-band-2 p-5 md:block" aria-live="polite">
                {current && <Preview item={current} seeing={seeing} />}
              </aside>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-5 border-t px-5 text-body text-muted-foreground">
              <span>↑↓ move</span>
              <span>↵ open</span>
              <span>{mod}↵ ask Hoot</span>
              <span className="flex-1" />
              <span className="hidden sm:inline">{asking ? "Opening a chat with Hoot…" : "Hoot also takes “dark mode” or “switch to FIG”"}</span>
            </div>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ItemRow({ item }: { item: Item }) {
  const icon = "size-4 shrink-0 text-muted-foreground";
  switch (item.kind) {
    case "holding":
      return (
        <>
          <Briefcase className={icon} />
          <span className="font-mono text-body font-semibold">{item.holding.ticker}</span>
          <span className="min-w-0 flex-1 truncate text-body text-muted-foreground">
            {item.holding.company} · {item.holding.team}
          </span>
          <span className="text-body text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100">↵</span>
        </>
      );
    case "ask":
      return (
        <>
          <MessageSquareText className={icon} />
          <span className="min-w-0 flex-1 truncate">{item.text}</span>
        </>
      );
    case "suggest":
      return (
        <>
          <Sparkles className={icon} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.text}</span>
        </>
      );
    case "page":
      return (
        <>
          <PageIcon label={item.page.label} />
          <span className="shrink-0">{item.page.label}</span>
          {item.page.hint && <span className="min-w-0 flex-1 truncate text-body text-muted-foreground">{item.page.hint}</span>}
        </>
      );
    case "scope":
      return (
        <>
          <Layers className={icon} />
          <span className="min-w-0 flex-1 truncate">Switch scope to {item.scope.label}</span>
        </>
      );
    case "theme":
      return (
        <>
          {item.theme === "dark" ? <Moon className={icon} /> : <Sun className={icon} />}
          <span className="min-w-0 flex-1 truncate">Switch to {item.theme} mode</span>
        </>
      );
  }
}

function PageIcon({ label }: { label: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (/calendar|earnings/i.test(label)) return <CalendarDays className={cls} />;
  if (/attribution|risk|exposure|backtesting|ledger/i.test(label)) return <ChartColumn className={cls} />;
  return <ArrowRight className={cls} />;
}

function Preview({ item, seeing }: { item: Item; seeing: string | null }) {
  if (item.kind === "holding") return <HoldingPreview holding={item.holding} />;
  const command = item.kind === "ask" && parseHootCommand(item.text);
  const [title, body] = command
    ? ["Hoot", "Does this right away. No chat is opened."]
    : item.kind === "ask"
      ? ["Ask Hoot", `Opens ${item.ticker ? `a chat in ${item.ticker} research` : "a research chat"} and sends this question. Hoot cites a source for every fact.`]
      : item.kind === "suggest"
        ? ["Suggested question", "Puts it in the box so you can edit it. Enter then asks Hoot."]
        : item.kind === "page"
          ? [item.page.label, item.page.hint ?? "Open this page."]
          : item.kind === "scope"
            ? [item.scope.label, "Every section follows the scope. You stay on the same kind of page."]
            : [`${item.theme === "dark" ? "Dark" : "Light"} mode`, "Remembered in this browser."];
  return (
    <div>
      <div className="text-emph font-semibold">{title}</div>
      <p className="mt-1.5 text-body leading-relaxed text-muted-foreground">{body}</p>
      {seeing && !command && (item.kind === "ask" || item.kind === "suggest") && (
        <p className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 px-2 py-0.5 text-caption text-muted-foreground">
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
    ["vs S&P, last session", q?.relativePp != null ? fmtBp(ppToBp(q.relativePp)) : "—", q?.relativePp == null ? undefined : q.relativePp >= 0 ? "text-up" : "text-down"],
    ["Next report", h.nextReport ? `${shortDate(h.nextReport)}${h.nextReportEstimated ? " (est.)" : ""}` : "—"],
    ["Open items", h.openMovement ? "Movement write-up open" : "None", h.openMovement ? "text-hoot-foreground" : undefined],
  ];
  return (
    <div>
      <div className="font-mono text-title font-semibold">{h.ticker}</div>
      <div className="text-body text-muted-foreground">
        {h.company} · {h.team}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="figure text-display">{fmtCurrency(q?.price, q?.currency)}</span>
        {q?.changePct != null && <span className={cn("font-mono text-body", q.changePct >= 0 ? "text-up" : "text-down")}>{fmtPct(q.changePct)}</span>}
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
