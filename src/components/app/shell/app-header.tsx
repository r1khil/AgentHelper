"use client";

import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import type { NavModel } from "@/lib/nav";
import type { TabCount } from "@/lib/nav-data";
import { isMac } from "@/lib/hoot/shortcuts";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

/**
 * The 56px header: the section title and its tabs (with counts), or on a page about one item a link back up to its
 * list in their place; then the ⌘K box.
 */
export function AppHeader({ nav, counts, onOpenCommand }: { nav: NavModel; counts: Record<string, TabCount>; onOpenCommand: () => void }) {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  return (
    <header className="sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-6 border-b bg-background px-6 md:flex">
      {nav.back ? (
        // The page's own title is its h1; this is its one "where am I / go up" line, above the page's tabs.
        <nav aria-label="Breadcrumb">
          <Link
            href={nav.back.href}
            className="group flex items-center gap-1.5 text-[17px] font-semibold tracking-[-0.015em] whitespace-nowrap focus-visible:underline focus-visible:outline-none"
          >
            <ArrowLeft className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            <span className="sr-only">Back to </span>
            {nav.back.label}
          </Link>
        </nav>
      ) : (
        <h1 className="text-[17px] font-semibold tracking-[-0.015em] whitespace-nowrap">{nav.title}</h1>
      )}
      {nav.tabs.length > 0 && (
        <nav data-tour="section-tabs" aria-label={`${nav.title} pages`} className="flex gap-5 self-stretch">
          {nav.tabs.map((t) => {
            const c = counts[t.key];
            return (
              <Link
                key={t.key}
                href={t.href}
                data-tour={`nav-${t.key}`}
                aria-current={t.active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:[&>span:first-child]:underline",
                  t.active ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{t.label}</span>
                {c && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-[11px] leading-[17px] font-medium",
                      c.hot ? "bg-hoot text-hoot-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.value}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <div className="flex-1" />
      <button
        type="button"
        data-tour="command"
        onClick={onOpenCommand}
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        className="flex h-9 w-full max-w-[380px] min-w-56 items-center gap-2.5 rounded-full bg-card pr-2 pl-3.5 text-left shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_var(--border-strong)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Search className="size-[15px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">Ask Hoot, or jump to a holding or page</span>
        <kbd className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
    </header>
  );
}
