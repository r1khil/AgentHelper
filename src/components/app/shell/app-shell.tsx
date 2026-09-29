"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { Team } from "@/db/schema";
import { PanelLeft } from "lucide-react";
import { FUND_SCOPE_SLUG, SIDEBAR_COOKIE } from "@/lib/constants";
import { askShortcut, isMac } from "@/lib/hoot/shortcuts";
import { destinations, navModel } from "@/lib/nav";
import type { CommandHolding, NavData, RecentChat, TabCount } from "@/lib/nav-data";
import { resolveScope } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { HootAnswerPanel } from "../hoot/answer-panel";
import { HootCorner } from "../hoot/hoot-corner";
import { DefaultHead } from "../page-head";
import { MobileBar, Sidebar, useTeamSection, type SidebarUser } from "../sidebar";
import { CommandMenu } from "./command-menu";
import { NavSidebar, scopeLinks } from "./nav-sidebar";
import { ScopeProvider, useRememberedScope, useScopeSwitchNotice } from "./scope-context";
import { ShellProvider } from "./shell-context";

export type BacktestingLayout = "new" | "classic";

type Props = {
  user: SidebarUser;
  teams: Team[];
  signOut: () => Promise<void>;
  hoot: boolean;
  backtestingLayout: BacktestingLayout;
  /** The scope remembered from the last visit (a cookie), for a page outside /t/ loaded directly. */
  initialScope: string | null;
  /** The sidebar was hidden on the last visit (a cookie). */
  initialCollapsed: boolean;
  children: React.ReactNode;
};

/** Counts barely move; refetch on a new page at most this often. */
const COUNTS_MIN_MS = 30_000;
type LoadedNav = { scope: string; counts: Record<string, TabCount>; badges: NavData["badges"]; holdings: CommandHolding[]; recent: RecentChat[]; threads: RecentChat[] };

/**
 * The app chrome: the sidebar on the left, the page (with its header) on the right, Hoot's corner button, and the
 * palette that ⌘J (ask Hoot, scoped to the page) and ⌘K (search) open. A page renders its own PageHead; one that
 * doesn't yet gets the section's default header. The classic Backtesting layout (a per-member preference) keeps the
 * previous sidebar and look on that one page.
 */
export function AppShell({ user, teams, signOut, hoot, backtestingLayout, initialScope, initialCollapsed, children }: Props) {
  const pathname = usePathname();
  const fundWide = user.role === "exec" || user.role === "admin";
  // Pages outside /t/ (Home, a Hoot chat) keep the scope the member was last in rather than falling back to the fund.
  const remembered = useRememberedScope(pathname, initialScope, teams, fundWide);
  const current = resolveScope({ pathname, remembered, teams, fundWide, userTeamId: user.teamId });
  useScopeSwitchNotice(pathname, current);
  const team = current === "fund" ? null : current;
  const lead = (t: Team | null) => !!t && user.role === "lead_analyst" && user.teamId === t.id;
  const seesBook = current === "fund" || (!!team && (fundWide || lead(team)));
  const scope = current === "fund" ? ("fund" as const) : team ? { slug: team.slug } : null;
  const scopeSlug = current === "fund" ? FUND_SCOPE_SLUG : (team?.slug ?? null);

  // The sidebar's Research, Movements, Models and Calendar open on the whole fund for execs and admins, and on the
  // member's own team for everyone else, whatever page they're on.
  const ownTeam = teams.find((t) => t.id === user.teamId) ?? teams[0] ?? null;
  const home = fundWide ? ("fund" as const) : ownTeam ? { slug: ownTeam.slug } : null;
  const homeSlug = fundWide ? FUND_SCOPE_SLUG : (ownTeam?.slug ?? null);

  const nav = navModel({ pathname, scope, home, fundWide, seesBook, homeSeesBook: fundWide || lead(ownTeam) });
  const dests = destinations({ scope, fundWide, seesBook });

  const [collapsed, setCollapsed] = useSidebarCollapsed(initialCollapsed);
  const [palette, setPalette] = useState<"ask" | "search" | null>(null);
  const [data, setData] = useState<LoadedNav | null>(null);
  const fetchedAt = useRef<{ scope: string; at: number } | null>(null);

  const load = useCallback(async (slug: string, force = false) => {
    const last = fetchedAt.current;
    if (!force && last && last.scope === slug && Date.now() - last.at < COUNTS_MIN_MS) return;
    fetchedAt.current = { scope: slug, at: Date.now() };
    try {
      const res = await fetch(`/api/nav?scope=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (res.ok) setData({ scope: slug, ...(await res.json()) });
    } catch {
      // Counts are a nicety; the sidebar and tabs work without them.
    }
  }, []);

  const loaded = data && data.scope === homeSlug ? data : null;
  // A thread the sidebar doesn't list yet (one just asked) refreshes the list at once.
  const unlisted = /^\/hoot\/[^/]+$/.test(pathname) && !!loaded && !loaded.threads.some((t) => t.href === pathname);

  // After the page settles, and again on a new page: the sidebar's threads, ⌘K's holdings and recent answers.
  useEffect(() => {
    if (!homeSlug) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void load(homeSlug, unlisted));
    return () => cancel(id);
  }, [homeSlug, pathname, load, unlisted]);

  const openPalette = useCallback(
    (mode: "ask" | "search") => {
      setPalette(mode);
      if (homeSlug) void load(homeSlug);
    },
    [homeSlug, load],
  );

  // ⌘J asks Hoot and ⌘K searches, from anywhere, even a text field. Pressing the open one again closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      const j = askShortcut(e);
      if (!k && !j) return;
      e.preventDefault();
      const mode = j ? "ask" : "search";
      setPalette((open) => (open === mode ? null : mode));
      if (homeSlug) void load(homeSlug);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [homeSlug, load]);

  const section = useTeamSection();
  const scopes = useMemo(() => scopeLinks(teams, fundWide, section), [teams, fundWide, section]);
  const switchable = useMemo(
    () => scopes.filter((s) => !(current === "fund" ? s.label === "Whole fund" : s.label === team?.name)),
    [scopes, current, team?.name],
  );

  const shell = { nav, counts: loaded?.counts ?? {}, badges: loaded?.badges ?? {}, teams, current, fundWide };
  const command = (
    <>
      <CommandMenu
        open={palette !== null}
        mode={palette ?? "ask"}
        onOpenChange={(open) => !open && setPalette(null)}
        holdings={loaded?.holdings ?? []}
        recent={loaded?.recent ?? []}
        pages={dests}
        scopes={fundWide ? switchable : []}
        scopeLabel={current === "fund" ? "Whole fund" : current?.name}
        pathname={pathname}
        teamSlug={scopeSlug === FUND_SCOPE_SLUG ? (ownTeam?.slug ?? null) : scopeSlug}
        scopeSlug={scopeSlug}
      />
      {/* A question asked from the palette is answered here, sliding in over the page. */}
      <HootAnswerPanel holdings={loaded?.holdings ?? []} />
    </>
  );
  const corner = hoot && <HootCorner onAsk={() => openPalette("ask")} suppressed={palette !== null} />;

  // The provider lets links built on the client (book tables, the sidebar) open in the scope in view.
  if (pathname === "/backtesting" && backtestingLayout === "classic") {
    return (
      <ScopeProvider value={scopeSlug}>
        <ShellProvider value={shell}>
          <div className="theme-classic flex min-h-screen flex-col md:flex-row">
            <Sidebar user={user} teams={teams} signOut={signOut} />
            <main className="min-w-0 flex-1">
              <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", hoot && "pb-24 md:pb-8")}>{children}</div>
            </main>
            {command}
            {corner}
          </div>
        </ShellProvider>
      </ScopeProvider>
    );
  }

  return (
    <ScopeProvider value={scopeSlug}>
      <ShellProvider value={shell}>
        <div className="flex min-h-dvh flex-col md:flex-row">
          {/* Collapsed, the sidebar stays mounted (hidden) so Hoot can still find its pages by name. */}
          <div className={collapsed ? "hidden" : "hidden md:contents"}>
            <NavSidebar
              nav={nav}
              user={user}
              ownTeam={ownTeam}
              fundWide={fundWide}
              threads={homeSlug ? (loaded?.threads ?? null) : []}
              pathname={pathname}
              signOut={signOut}
              onAsk={() => openPalette("ask")}
              onSearch={() => openPalette("search")}
              destinations={dests.filter((d) => d.hoot).map((d) => ({ label: d.hoot!, href: d.href }))}
              scopes={scopes}
              onCollapse={() => setCollapsed(true)}
            />
          </div>
          {collapsed && <ExpandSidebar onExpand={() => setCollapsed(false)} />}
          <MobileBar user={user} teams={teams} signOut={signOut} />
          <div data-shell-main="" className="flex min-w-0 flex-1 flex-col">
            <DefaultHead />
            {/* data-role lets a page's loading skeleton match what this reader will see (page-skeletons.tsx). */}
            <main data-role={user.role} className="app-container flex min-w-0 flex-1 flex-col">
              {children}
            </main>
          </div>
          {command}
          {corner}
        </div>
      </ShellProvider>
    </ScopeProvider>
  );
}

/**
 * Whether the sidebar is hidden, remembered in a cookie so a reload (and the server's render) keeps it. ⌘\ toggles it
 * from anywhere.
 */
function useSidebarCollapsed(initial: boolean) {
  const [collapsed, setCollapsed] = useState(initial);
  useEffect(() => {
    document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "collapsed" : "open"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "\\" && e.code !== "Backslash") || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [collapsed, setCollapsed] as const;
}

const noSubscribe = () => () => {};

/** With the sidebar hidden: a small button in the header's left margin that brings it back. */
function ExpandSidebar({ onExpand }: { onExpand: () => void }) {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => true);
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Show sidebar"
      title={`Show sidebar (${mac ? "⌘\\" : "Ctrl \\"})`}
      aria-keyshortcuts={mac ? "Meta+\\" : "Control+\\"}
      className="fixed top-3 left-1.5 z-30 hidden size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring md:flex"
    >
      <PanelLeft className="size-[15px]" strokeWidth={1.8} aria-hidden />
    </button>
  );
}
