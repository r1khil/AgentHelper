"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import type { Team } from "@/db/schema";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { fmtChangePct, fmtTime } from "@/lib/format";
import { isMac } from "@/lib/hoot/shortcuts";
import type { NavItem, NavModel } from "@/lib/nav";
import type { NavBadge } from "@/lib/nav-data";
import { marketPhase } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import { AccountMenu, type SidebarUser } from "../sidebar";

const noSubscribe = () => () => {};

/**
 * The sidebar: Ask Hoot (⌘J) and Search (⌘K) first, then the six places, the teams with today's move, and Manage for
 * execs and admins. Badges are words ("1 overdue"), red only when something is overdue. The market's state is the
 * last line. Hidden links let Hoot open any page or scope by name ("take me to risk").
 */
export function NavSidebar({
  nav,
  user,
  teams,
  current,
  fundWide,
  badges,
  moves,
  signOut,
  onAsk,
  onSearch,
  destinations,
  scopes,
}: {
  nav: NavModel;
  user: SidebarUser;
  /** The teams this member can open. */
  teams: Team[];
  current: Team | "fund" | null;
  fundWide: boolean;
  badges: Partial<Record<"movements" | "models", NavBadge>>;
  /** Today's return per team id, in percent; missing while it loads or when the member can't see it. */
  moves: Record<string, number>;
  signOut: () => Promise<void>;
  onAsk: () => void;
  onSearch: () => void;
  destinations: { label: string; href: string }[];
  scopes: { label: string; href: string }[];
}) {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  const teamActive = (t: Team) => nav.section === "team" && current !== "fund" && current?.id === t.id;
  return (
    <nav
      aria-label="Main"
      data-tour="sidebar"
      className="sticky top-0 z-30 flex h-dvh w-[232px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 pt-3.5 pb-3 text-body text-sidebar-foreground"
    >
      <div className="flex items-center gap-2.5 px-2 pt-0.5 pb-3.5">
        <OwlGlyph />
        <Link href="/" className="flex-1 font-semibold focus-visible:underline focus-visible:outline-none">
          Owl Fund
        </Link>
        <AccountMenu user={user} fundWide={fundWide} signOut={signOut} variant="avatar" />
      </div>

      <button type="button" onClick={onAsk} data-tour="ask-hoot" aria-keyshortcuts={mac ? "Meta+J" : "Control+J"} className={row(false)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span className="flex-1 text-left">Ask Hoot</span>
        <kbd className="font-mono text-caption text-muted-foreground">{mac ? "⌘J" : "Ctrl J"}</kbd>
      </button>
      <button type="button" onClick={onSearch} data-tour="command" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} className={row(false)}>
        <Search className="size-[15px]" strokeWidth={1.8} aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-mono text-caption text-muted-foreground">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>

      <div className="h-3 shrink-0" />
      {nav.main.map((item) => (
        <SideLink key={item.key} item={item} badge={item.key === "movements" || item.key === "models" ? badges[item.key] : undefined} />
      ))}

      {teams.length > 0 && (
        <>
          <div className="px-2 pt-[18px] pb-1.5 text-caption text-muted-foreground">{teams.length > 1 ? "Teams" : "Your team"}</div>
          {teams.map((t) => {
            const move = moves[t.id];
            const active = teamActive(t);
            return (
              <Link key={t.id} href={`/t/${t.slug}`} aria-current={active ? "page" : undefined} data-hoot-destination={t.name} className={row(active)}>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {move !== undefined && <span className={cn("text-caption tabular-nums", move < 0 ? "text-down" : move > 0 ? "text-up" : "text-muted-foreground")}>{fmtChangePct(move)}</span>}
              </Link>
            );
          })}
        </>
      )}

      {nav.manage.length > 0 && (
        <>
          <div className="px-2 pt-[18px] pb-1.5 text-caption text-muted-foreground">Manage</div>
          {nav.manage.map((item) => (
            <SideLink key={item.key} item={item} />
          ))}
        </>
      )}

      <div className="min-h-4 flex-1" />
      <MarketStatus />

      {/* Every page and scope Hoot can open by name, including pages that are tabs of another section. */}
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
    "flex h-[30px] shrink-0 items-center gap-2 rounded-lg px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
    active ? "bg-sidebar-accent font-semibold text-foreground" : "text-ink-3 hover:bg-sidebar-accent hover:text-foreground",
  );

function SideLink({ item, badge }: { item: NavItem; badge?: NavBadge }) {
  return (
    <Link href={item.href} data-tour={`nav-${item.key}`} aria-current={item.active ? "page" : undefined} className={row(item.active)}>
      <span className="flex-1">{item.label}</span>
      {badge && <span className={cn("text-caption font-semibold", badge.hot ? "text-down" : "text-ink-2")}>{badge.label}</span>}
    </Link>
  );
}

/** The app's mark in the sidebar: an owl's face in the same 1.8px stroke as the icons. */
function OwlGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 9c0-3 3-5 7-5s7 2 7 5v6c0 3-3 5-7 5s-7-2-7-5z" />
      <circle cx="9" cy="10.5" r="2" />
      <circle cx="15" cy="10.5" r="2" />
    </svg>
  );
}

/** "Market open · 2:41 PM ET", refreshed every half minute; a green dot only while the session is on. */
function MarketStatus() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <div className="h-[29px] shrink-0" />;
  const m = marketPhase(now);
  const text =
    m.phase === "open" ? `Market open · ${fmtTime(now)}` : m.phase === "pre" ? `Market opens at ${fmtTime(m.opensAt)}` : `Market closed · ${fmtTime(now)}`;
  return (
    <div className="flex shrink-0 items-center gap-2 px-2 py-1.5 text-caption text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", m.phase === "open" ? "bg-foreground" : "bg-muted-foreground/60")} />
      {text}
    </div>
  );
}

/** The scopes a member can switch to by name, for Hoot: the fund for execs and admins, and each team. */
export function scopeLinks(teams: Team[], fundWide: boolean, section: string) {
  return [...(fundWide ? [{ label: "Whole fund", href: `/t/${FUND_SCOPE_SLUG}${section}` }] : []), ...teams.map((t) => ({ label: t.name, href: `/t/${t.slug}${section}` }))];
}
