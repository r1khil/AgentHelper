"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PanelLeft, Plus, Search } from "lucide-react";
import type { Team } from "@/db/schema";
import { FUND_SCOPE_SLUG, ROLE_LABELS } from "@/lib/constants";
import { isMac } from "@/lib/hoot/shortcuts";
import type { NavItem, NavModel } from "@/lib/nav";
import type { RecentChat } from "@/lib/nav-data";
import { cn } from "@/lib/utils";
import { AccountMenu, type SidebarUser } from "../sidebar";
import { Bell } from "./bell";

const noSubscribe = () => () => {};

/**
 * The sidebar, Perplexity-style: the owl and name with Search (⌘K) and hide, New (Home's ask box; ⌘J asks from
 * anywhere), the three places (Portfolio, Markets and the Screener), then Threads, the conversations with Hoot, newest first (the
 * label opens all of them). The footer is who you are (the
 * account menu: what's new, Admin, preferences) and the bell with what needs you. Hidden links let Hoot open any page
 * or scope by name ("take me to risk").
 */
export function NavSidebar({
  nav,
  user,
  ownTeam,
  fundWide,
  threads,
  pathname,
  signOut,
  onSearch,
  destinations,
  scopes,
  onCollapse,
}: {
  nav: NavModel;
  user: SidebarUser;
  /** The member's own team, for the line under their name. */
  ownTeam: Team | null;
  fundWide: boolean;
  /** The conversations with Hoot, newest first; null while they load. */
  threads: RecentChat[] | null;
  pathname: string;
  signOut: () => Promise<void>;
  onSearch: () => void;
  destinations: { label: string; href: string }[];
  scopes: { label: string; href: string }[];
  onCollapse: () => void;
}) {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  const icon = "flex size-[30px] items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
  const subtitle = fundWide ? `${ROLE_LABELS[user.role]}, whole fund` : ownTeam ? `${ROLE_LABELS[user.role]}, ${ownTeam.name}` : ROLE_LABELS[user.role];
  return (
    <nav
      aria-label="Main"
      data-tour="sidebar"
      className="sticky top-0 z-30 flex h-dvh w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar pt-3.5 text-emph text-sidebar-foreground"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 px-[18px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hoot/mark.webp" alt="" width={24} height={24} className="size-6 rounded-full" />
        <Link href="/" className="flex-1 truncate font-semibold focus-visible:underline focus-visible:outline-none">
          Owl Fund
        </Link>
        <button type="button" onClick={onSearch} data-tour="command" aria-label="Search" title={`Search (${mac ? "⌘K" : "Ctrl K"})`} aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} className={icon}>
          <Search className="size-[17px]" strokeWidth={1.8} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide sidebar"
          title={`Hide sidebar (${mac ? "⌘\\" : "Ctrl \\"})`}
          aria-keyshortcuts={mac ? "Meta+\\" : "Control+\\"}
          className={icon}
        >
          <PanelLeft className="size-[17px]" strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <div className="mt-3.5 flex shrink-0 flex-col gap-0.5 px-3">
        {/* New goes Home, where the ask box starts a thread; ⌘J asks from wherever you are. */}
        <Link href="/" data-tour="ask-hoot" aria-current={nav.section === "home" ? "page" : undefined} aria-keyshortcuts={mac ? "Meta+J" : "Control+J"} className={row(nav.section === "home")}>
          <span className="grid size-6 place-items-center rounded-full bg-secondary">
            <Plus className="size-3.5" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="flex-1">New</span>
          <kbd className="font-mono text-caption text-muted-foreground">{mac ? "⌘J" : "Ctrl J"}</kbd>
        </Link>
        {nav.main.map((item) => (
          <SideLink key={item.key} item={item} />
        ))}
      </div>

      <Link href="/hoot" data-hoot-destination="All threads" className="mx-3 mt-[22px] shrink-0 self-start rounded px-2 text-body text-muted-foreground no-underline transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Threads
      </Link>
      <div data-tour="threads" className="mt-1.5 flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-3 pb-3">
        {threads === null ? (
          Array.from({ length: 5 }, (_, i) => <span key={i} aria-hidden="true" className="mx-2 my-[9px] h-3.5 shrink-0 animate-pulse rounded bg-sidebar-accent" style={{ width: `${80 - i * 9}%` }} />)
        ) : threads.length === 0 ? (
          <p className="px-2 py-1.5 text-body text-muted-foreground">Your questions to Hoot show up here.</p>
        ) : (
          threads.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                title={t.ticker ? `${t.ticker}: ${t.title}` : t.title}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block h-8 shrink-0 truncate rounded-lg px-2 text-body leading-8 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                  active ? "bg-sidebar-accent text-foreground" : "text-ink-3 hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                {t.ticker && <span className="mr-1.5 font-semibold text-foreground">{t.ticker}</span>}
                {t.ticker && " "}
                {t.title}
              </Link>
            );
          })
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center gap-1 border-t border-sidebar-border pr-2.5 pl-3">
        <AccountMenu user={user} fundWide={fundWide} signOut={signOut} variant="footer" subtitle={subtitle} />
        <Bell />
      </div>

      {/* Every page and scope Hoot can open by name, including the Portfolio's views. */}
      <div hidden aria-hidden="true">
        {destinations.map((d) => (
          <a key={d.label} href={d.href} data-hoot-destination={d.label} tabIndex={-1} />
        ))}
        {scopes.map((s) => (
          <span key={s.label} data-hoot-scope={s.label} data-hoot-href={s.href} />
        ))}
      </div>
    </nav>
  );
}

const row = (active: boolean) =>
  cn(
    "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
    active ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent",
  );

const ICONS: Partial<Record<NavItem["key"], React.ReactNode>> = {
  portfolio: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mx-[3px]">
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  ),
  markets: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="mx-[3px]">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  ),
  screener: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="mx-[3px]">
      <path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" />
    </svg>
  ),
};

function SideLink({ item }: { item: NavItem }) {
  return (
    <Link href={item.href} data-tour={`nav-${item.key}`} data-hoot-destination={item.label} aria-current={item.active ? "page" : undefined} className={row(item.active)}>
      {ICONS[item.key]}
      <span className="flex-1">{item.label}</span>
    </Link>
  );
}

/** The scopes a member can switch to by name, for Hoot: the fund for execs and admins, and each team. */
export function scopeLinks(teams: Team[], fundWide: boolean, section: string) {
  return [...(fundWide ? [{ label: "Whole fund", href: `/t/${FUND_SCOPE_SLUG}${section}` }] : []), ...teams.map((t) => ({ label: t.name, href: `/t/${t.slug}${section}` }))];
}
