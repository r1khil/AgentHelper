"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import { toast } from "sonner";
import { ArrowRight, Briefcase, CalendarDays, ChartColumn, Layers, MessageSquareText, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { startHootChat } from "@/lib/actions/chats";
import { boardHref, holdingHref } from "@/lib/scope";
import { markScopeIntent } from "./scope-intent";
import type { CommandHolding } from "@/lib/nav-data";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useHootCommand } from "../hoot/use-hoot-command";
import { leaveHootQuestion } from "../hoot/handoff";
import { pageContextFor } from "../hoot/page-context";
import { OwlMark } from "../owl-mark";

export type CommandPage = { label: string; href: string; hint?: string; keywords?: string };
export type CommandScope = { label: string; href: string };

type Item =
  | { kind: "holding"; id: string; holding: CommandHolding }
  | { kind: "ask"; id: string; text: string; ticker: string | null; teamSlug: string | null }
  | { kind: "page"; id: string; page: CommandPage }
  | { kind: "scope"; id: string; scope: CommandScope }
  | { kind: "theme"; id: string; theme: "dark" | "light" };

const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * ⌘K: jump to a holding or page, run a quick action, or turn the text into a question for Hoot (Tab).
 * Hoot's panel keeps its own shortcuts (⌘J, Alt S); this replaces nothing.
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
  const { resolvedTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [asking, setAsking] = useState(false);

  // Start fresh each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSelected("");
    }
  }

  const groups = useMemo(
    () => buildGroups({ query, holdings, pages, scopes, teamSlug, scopeSlug, dark: resolvedTheme === "dark" }),
    [query, holdings, pages, scopes, teamSlug, scopeSlug, resolvedTheme],
  );
  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => i.id === selected) ?? all[0] ?? null;

  const close = () => onOpenChange(false);

  const ask = async (text: string, ticker: string | null, slug: string | null) => {
    const q = text.trim();
    if (!q || asking) return;
    if (runCommand(q)) return close();
    setAsking(true);
    try {
      const page = pageContextFor(pathname);
      const res = await startHootChat({ teamSlug: slug, ticker });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (!leaveHootQuestion(res.chatId, q, page)) toast("Your chat is open. Paste your question to send it.");
      close();
      router.push(res.href);
    } catch {
      toast.error("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
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
              // Tab turns whatever is typed into a question for Hoot.
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                const h = current?.kind === "holding" ? current.holding : null;
                void ask(query, h?.ticker ?? null, h?.teamSlug ?? teamSlug);
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
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">esc</kbd>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px]">
              <Command.List className="max-h-[440px] min-h-0 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5">
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing matches. Press Tab to ask Hoot instead.</Command.Empty>
                {groups.map((g) => (
                  <Command.Group
                    key={g.label}
                    heading={
                      <span className="label-mono flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
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
                        className="flex h-[38px] cursor-pointer items-center gap-3 rounded-[10px] px-3 text-[14.5px] data-[selected=true]:bg-band"
                      >
                        <ItemRow item={item} />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
              <aside className="hidden border-l bg-band-2 p-5 md:block" aria-live="polite">
                {current && <Preview item={current} />}
              </aside>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-5 border-t px-5 text-xs text-muted-foreground">
              <span>↑↓ move</span>
              <span>↵ open</span>
              <span>Tab ask Hoot instead</span>
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
          <span className="font-mono text-[14px] font-semibold">{item.holding.ticker}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {item.holding.company} · {item.holding.team}
          </span>
          <span className="text-xs text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100">↵</span>
        </>
      );
    case "ask":
      return (
        <>
          <MessageSquareText className={icon} />
          <span className="min-w-0 flex-1 truncate">{item.text}</span>
        </>
      );
    case "page":
      return (
        <>
          <PageIcon label={item.page.label} />
          <span className="shrink-0">{item.page.label}</span>
          {item.page.hint && <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{item.page.hint}</span>}
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

function Preview({ item }: { item: Item }) {
  if (item.kind === "holding") return <HoldingPreview holding={item.holding} />;
  const [title, body] =
    item.kind === "ask"
      ? ["Ask Hoot", "Opens a research chat and sends this question. Hoot cites a source for every fact."]
      : item.kind === "page"
        ? [item.page.label, item.page.hint ?? "Open this page."]
        : item.kind === "scope"
          ? [item.scope.label, "Every section follows the scope. You stay on the same kind of page."]
          : [`${item.theme === "dark" ? "Dark" : "Light"} mode`, "Remembered in this browser."];
  return (
    <div>
      <div className="text-[15px] font-semibold">{title}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
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
    ["Owner", h.owner ?? "Unassigned", h.owner ? undefined : "text-caution-foreground"],
    ["Weight", h.weightPct != null ? `${h.weightPct.toFixed(1)}% of NAV` : "—"],
    ["vs S&P, last session", q?.relativePp != null ? `${q.relativePp > 0 ? "+" : ""}${q.relativePp.toFixed(1)} pp` : "—", q?.relativePp == null ? undefined : q.relativePp >= 0 ? "text-up" : "text-down"],
    ["Next report", h.nextReport ? `${shortDate(h.nextReport)}${h.nextReportEstimated ? " (est.)" : ""}` : "—"],
    ["Open items", h.openMovement ? "Movement write-up open" : "None", h.openMovement ? "text-hoot-foreground" : undefined],
  ];
  return (
    <div>
      <div className="font-mono text-[17px] font-semibold">{h.ticker}</div>
      <div className="text-[13px] text-muted-foreground">
        {h.company} · {h.team}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="figure text-2xl">{fmtCurrency(q?.price, q?.currency)}</span>
        {q?.changePct != null && <span className={cn("font-mono text-xs", q.changePct >= 0 ? "text-up" : "text-down")}>{fmtPct(q.changePct)}</span>}
      </div>
      <dl className="mt-4 border-t">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex items-center justify-between gap-3 border-b border-row py-2 text-[13px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("text-right", cls)}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function buildGroups({
  query,
  holdings,
  pages,
  scopes,
  teamSlug,
  scopeSlug,
  dark,
}: {
  query: string;
  holdings: CommandHolding[];
  pages: CommandPage[];
  scopes: CommandScope[];
  teamSlug: string | null;
  scopeSlug: string | null;
  dark: boolean;
}): { label: string; items: Item[] }[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const matches = (text: string) => words.every((w) => text.toLowerCase().includes(w));

  const holdingHits = q
    ? holdings
        .map((h) => ({ h, rank: h.ticker.toLowerCase() === q ? 0 : h.ticker.toLowerCase().startsWith(q) ? 1 : matches(`${h.ticker} ${h.company} ${h.team}`) ? 2 : 9 }))
        .filter((x) => x.rank < 9)
        .sort((a, b) => a.rank - b.rank || a.h.ticker.localeCompare(b.h.ticker))
        .slice(0, 5)
        .map((x) => x.h)
    : [];
  const top = holdingHits[0] && holdingHits[0].ticker.toLowerCase().startsWith(q.split(/\s+/)[0] ?? "") ? holdingHits[0] : null;

  const ask: Item[] = [];
  if (top) {
    ask.push(
      { kind: "ask", id: `ask:moved:${top.ticker}`, text: `What moved ${top.ticker} in the last session vs the S&P 500?`, ticker: top.ticker, teamSlug: top.teamSlug },
      { kind: "ask", id: `ask:10q:${top.ticker}`, text: `Summarize ${top.ticker}'s last 10-Q, with sources`, ticker: top.ticker, teamSlug: top.teamSlug },
    );
  } else if (q.length > 2) {
    ask.push({ kind: "ask", id: "ask:free", text: query.trim(), ticker: null, teamSlug });
  }

  const go: Item[] = [];
  if (top) {
    // In the scope in view: the fund shows every team's holdings, a team its own (⌘K lists only those).
    go.push(
      { kind: "page", id: `go:board:${top.ticker}`, page: { label: `${top.ticker} research`, href: boardHref(scopeSlug, top.teamSlug, top.ticker), hint: "Hoot's chats about this holding" } },
      { kind: "page", id: `go:earnings:${top.ticker}`, page: { label: `${top.ticker} earnings`, href: holdingHref(scopeSlug, top.teamSlug, top.ticker, "?tab=earnings"), hint: top.nextReport ? `${shortDate(top.nextReport)}${top.nextReportEstimated ? " est." : ""}` : "No report scheduled" } },
    );
  }
  const pageHits = (q ? pages.filter((p) => matches(`${p.label} ${p.keywords ?? ""} ${p.hint ?? ""}`)) : pages).slice(0, q ? 6 : 8);
  go.push(...pageHits.map((p): Item => ({ kind: "page", id: `page:${p.href}:${p.label}`, page: p })));

  const doItems: Item[] = [];
  const scopeHits = q ? scopes.filter((s) => matches(s.label) || (top && s.label === top.team)) : [];
  doItems.push(...scopeHits.slice(0, 3).map((s): Item => ({ kind: "scope", id: `scope:${s.href}`, scope: s })));
  if (q && ("dark mode".includes(q) || "light mode".includes(q) || matches("theme mode dark light"))) {
    doItems.push({ kind: "theme", id: "theme", theme: dark ? "light" : "dark" });
  }

  return [
    { label: "Holding", items: holdingHits.map((h): Item => ({ kind: "holding", id: `holding:${h.ticker}`, holding: h })) },
    { label: "Ask Hoot", items: ask },
    { label: "Go to", items: go },
    { label: "Do", items: doItems },
  ].filter((g) => g.items.length);
}
