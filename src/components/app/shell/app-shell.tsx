"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Team } from "@/db/schema";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { destinations, navModel } from "@/lib/nav";
import type { CommandHolding, TabCount } from "@/lib/nav-data";
import { resolveScope } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { HootCompanion } from "../hoot/hoot-companion";
import { MobileBar, Sidebar, useTeamSection, type SidebarUser } from "../sidebar";
import { AppHeader } from "./app-header";
import { CommandMenu } from "./command-menu";
import { Rail } from "./rail";
import { ScopeProvider, useRememberedScope, useScopeSwitchNotice } from "./scope-context";

export type BacktestingLayout = "new" | "classic";

type Props = {
  user: SidebarUser;
  teams: Team[];
  signOut: () => Promise<void>;
  firstName: string;
  hoot: boolean;
  backtestingLayout: BacktestingLayout;
  /** The scope remembered from the last visit (a cookie), for a page outside /t/ loaded directly. */
  initialScope: string | null;
  children: React.ReactNode;
};

/** Counts barely move; refetch on a new section at most this often. */
const COUNTS_MIN_MS = 30_000;

/**
 * The app chrome: the rail, the header with the section's tabs and ⌘K, the content area, and Hoot in the corner.
 * The classic Backtesting layout (a per-member preference) keeps the previous sidebar and look.
 */
export function AppShell({ user, teams, signOut, firstName, hoot, backtestingLayout, initialScope, children }: Props) {
  const pathname = usePathname();
  const fundWide = user.role === "exec" || user.role === "admin";
  // Pages outside /t/ (Today, a Hoot chat) keep the scope the member was last in rather than falling back to the fund.
  const remembered = useRememberedScope(pathname, initialScope, teams, fundWide);
  const current = resolveScope({ pathname, remembered, teams, fundWide, userTeamId: user.teamId });
  useScopeSwitchNotice(pathname, current);
  const team = current === "fund" ? null : current;
  const seesBook = current === "fund" || (!!team && (fundWide || (user.role === "lead_analyst" && user.teamId === team.id)));
  const scope = current === "fund" ? ("fund" as const) : team ? { slug: team.slug } : null;
  const scopeSlug = current === "fund" ? FUND_SCOPE_SLUG : (team?.slug ?? null);

  const nav = navModel({ pathname, scope, fundWide, seesBook });
  const dests = destinations({ scope, fundWide, seesBook });

  const [commandOpen, setCommandOpen] = useState(false);
  const [data, setData] = useState<{ scope: string; counts: Record<string, TabCount>; holdings: CommandHolding[] } | null>(null);
  const fetchedAt = useRef<{ scope: string; at: number } | null>(null);

  const load = useCallback(async (slug: string, force = false) => {
    const last = fetchedAt.current;
    if (!force && last && last.scope === slug && Date.now() - last.at < COUNTS_MIN_MS) return;
    fetchedAt.current = { scope: slug, at: Date.now() };
    try {
      const res = await fetch(`/api/nav?scope=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (res.ok) setData({ scope: slug, ...(await res.json()) });
    } catch {
      // Counts are a nicety; the tabs work without them.
    }
  }, []);

  // After the page settles, and again when the section or scope changes.
  useEffect(() => {
    if (!scopeSlug) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 600));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void load(scopeSlug));
    return () => cancel(id);
  }, [scopeSlug, pathname, load]);

  // ⌘K / Ctrl K anywhere, even from a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setCommandOpen((o) => !o);
        if (scopeSlug) void load(scopeSlug);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scopeSlug, load]);

  const section = useTeamSection();
  const scopes = useMemo(() => {
    if (!fundWide) return [];
    return [{ label: "Whole fund", href: `/t/${FUND_SCOPE_SLUG}${section}` }, ...teams.map((t) => ({ label: t.name, href: `/t/${t.slug}${section}` }))].filter(
      (s) => !(current === "fund" ? s.label === "Whole fund" : s.label === team?.name),
    );
  }, [fundWide, teams, section, current, team?.name]);

  const counts = data && data.scope === scopeSlug ? data.counts : {};
  const companion = hoot && <HootCompanion firstName={firstName} suppressed={commandOpen} />;
  const command = (
    <CommandMenu
      open={commandOpen}
      onOpenChange={setCommandOpen}
      holdings={data?.holdings ?? []}
      pages={dests}
      scopes={scopes}
      pathname={pathname}
      teamSlug={scopeSlug === FUND_SCOPE_SLUG ? (user.teamId ? (teams.find((t) => t.id === user.teamId)?.slug ?? null) : null) : scopeSlug}
      scopeSlug={scopeSlug}
    />
  );

  // The provider lets links built on the client (book tables, the sidebar) open in the scope in view.
  if (pathname === "/backtesting" && backtestingLayout === "classic") {
    return (
      <ScopeProvider value={scopeSlug}>
        <div className="theme-classic flex min-h-screen flex-col md:flex-row">
          <Sidebar user={user} teams={teams} signOut={signOut} />
          <main className="min-w-0 flex-1">
            <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", hoot && "pb-24 md:pb-24")}>{children}</div>
          </main>
          {command}
          {companion}
        </div>
      </ScopeProvider>
    );
  }

  return (
    <ScopeProvider value={scopeSlug}>
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Rail
          nav={nav}
          user={user}
          teams={teams}
          current={current}
          fundWide={fundWide}
          signOut={signOut}
          destinations={dests.filter((d) => d.hoot).map((d) => ({ label: d.hoot!, href: d.href }))}
        />
        <MobileBar user={user} teams={teams} signOut={signOut} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader nav={nav} counts={counts} onOpenCommand={() => setCommandOpen(true)} />
          <main className="app-container flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col p-4 md:p-6">{children}</main>
        </div>
        {command}
        {companion}
      </div>
    </ScopeProvider>
  );
}
