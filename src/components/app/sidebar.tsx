"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  ChartColumn,
  ChartPie,
  Activity,
  Gauge,
  CalendarDays,
  CalendarClock,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronsUpDown,
  FlaskConical,
  Home,
  Layers,
  LogOut,
  Menu,
  Monitor,
  Moon,
  ScanEye,
  ScrollText,
  Settings,
  Mic,
  Sun,
  SunMoon,
  Table2,
  Briefcase,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FUND_SCOPE_SLUG, ROLE_LABELS } from "@/lib/constants";
import type { Role, Team } from "@/db/schema";
import { OwlMark } from "./owl-mark";
import { Segmented } from "./panel";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { setHootEnabled, setTransparencyMode } from "@/lib/actions/preferences";
import { resolveScope } from "@/lib/scope";
import { useScopeSlug } from "./shell/scope-context";
import { markScopeIntent } from "./shell/scope-intent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SidebarUser = { fullName: string; role: Role; teamId: string | null; email: string; username: string | null; transparencyMode: boolean; hootEnabled: boolean };

type Props = { user: SidebarUser; teams: Team[]; signOut: () => Promise<void> };

type Icon = React.ComponentType<{ className?: string }>;
type NavLink = { href: string; label: string; icon: Icon; exact?: boolean; also?: string };

/**
 * Which scope the section nav points at: the URL's own, else the one the app shell remembers (so Today or a Hoot
 * chat doesn't change it), else the whole fund for execs and admins and their team for everyone else.
 */
export function useCurrentTeam(teams: Team[], user: SidebarUser, fundWide: boolean): Team | "fund" | null {
  const pathname = usePathname();
  const remembered = useScopeSlug();
  return resolveScope({ pathname, remembered, teams, fundWide, userTeamId: user.teamId });
}

/** The list page under /t/<slug>/ being viewed ("" for Holdings), so switching scope keeps the reader on it. */
export function useTeamSection() {
  const pathname = usePathname();
  // A general chat isn't under any team; switching scope from one lands on that scope's Research page.
  if (/^\/hoot(\/|$)/.test(pathname)) return "/agent";
  // The fund's own Attribution, Daily, Risk and Exposure pages have team versions under /t/<slug>/.
  const book = pathname.match(/^\/(attribution|daily|risk|exposure)(\/|$)/);
  if (book) return `/${book[1]}`;
  const m = pathname.match(/^\/t\/[^/]+(\/[^/]+)?/);
  const section = m?.[1] ?? "";
  // Holding pages (/h/<ticker>) have no fund-wide list of their own; land on Holdings instead.
  return section === "/h" ? "" : section;
}

/**
 * The previous sidebar, kept for the classic Backtesting layout. Hoot, when he's on, is docked beside the account row
 * (`hoot`); his bubbles and panel open to the sidebar's right, which is why it stacks above the content.
 */
export function Sidebar({ hoot, ...props }: Props & { hoot?: React.ReactNode }) {
  return (
    <>
      <aside data-tour="sidebar" className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <SidebarBody {...props} dock={hoot} />
      </aside>
      <MobileBar {...props} />
    </>
  );
}

/** Under 768px the rail becomes this top bar and a sheet with the full navigation. */
export function MobileBar(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-40 flex items-center justify-between border-b bg-sidebar/95 px-4 py-2.5 backdrop-blur md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <OwlMark className="size-7" />
        <span className="text-body font-semibold">The Owl&apos;s Nest</span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {/* Close once a link is followed; React bubbles clicks from the portalled menus through here too. */}
          <div className="flex h-full min-h-0 flex-col" onClickCapture={(e) => (e.target as HTMLElement).closest("a[href]") && setOpen(false)}>
            <SidebarBody {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SidebarBody({ user, teams, signOut, dock }: Props & { dock?: React.ReactNode }) {
  const pathname = usePathname();
  const fundWide = user.role === "exec" || user.role === "admin";
  const current = useCurrentTeam(teams, user, fundWide);
  const team = current === "fund" ? null : current;
  const base = current === "fund" ? `/t/${FUND_SCOPE_SLUG}` : team ? `/t/${team.slug}` : null;
  // Position sizes and P&L: the whole fund for fund-wide roles, a team for its lead. The fund's pages live outside /t/.
  const seesBook = current === "fund" || (!!team && (fundWide || (user.role === "lead_analyst" && user.teamId === team.id)));
  const bookBase = current === "fund" ? "" : base;

  const research: NavLink[] = base
    ? [
        { href: base, label: "Holdings", icon: Briefcase, exact: true },
        { href: `${base}/agent`, label: "Research", icon: HootIcon, also: "/hoot" },
        { href: `${base}/sell-side`, label: "Sell-side calls", icon: Mic },
        { href: `${base}/models`, label: "Models", icon: Table2 },
      ]
    : [];
  const markets: NavLink[] = base
    ? [
        { href: `${base}/movements`, label: "Movements", icon: Activity },
        { href: `${base}/earnings`, label: "Earnings", icon: CalendarDays },
        { href: `${base}/economic-calendar`, label: "Economic calendar", icon: CalendarClock },
      ]
    : [];
  const portfolio: NavLink[] = seesBook
    ? [
        { href: `${bookBase}/attribution`, label: "Attribution", icon: ChartColumn },
        { href: `${bookBase}/daily`, label: "Daily", icon: Gauge },
        { href: `${bookBase}/risk`, label: "Risk", icon: ShieldAlert },
        { href: `${bookBase}/exposure`, label: "Exposure", icon: ChartPie },
      ]
    : [];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const linkActive = (n: NavLink) => isActive(n.href, n.exact) || (!!n.also && isActive(n.also));

  return (
    <>
      <div className="px-3 pt-4 pb-3">
        <Link href="/" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent">
          <OwlMark className="size-7" />
          <span className="text-body font-semibold">The Owl&apos;s Nest</span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
        <nav className="flex flex-col gap-px">
          <NavItem href="/" label="Today" icon={Home} active={pathname === "/"} />
          <NavItem href="/backtesting" label="Backtesting" icon={FlaskConical} active={isActive("/backtesting")} />
        </nav>

        <div className="mt-4">
          <ScopeSwitcher teams={teams} current={current} fundWide={fundWide} />
        </div>

        <NavGroup label="Research" links={research} active={linkActive} />
        <NavGroup label="Markets" links={markets} active={linkActive} />
        <NavGroup label="Portfolio" links={portfolio} active={linkActive} />

        {fundWide && (
          <NavGroup
            label="Manage"
            links={[
              { href: "/weekly", label: "Weekly update", icon: CalendarRange },
              { href: "/changelog", label: "Changelog", icon: ScrollText },
              { href: "/admin", label: "Admin", icon: Settings },
            ]}
            active={linkActive}
          />
        )}
      </div>

      <div className="flex items-center gap-1 border-t p-3">
        <div className="min-w-0 flex-1">
          <AccountMenu user={user} fundWide={fundWide} signOut={signOut} />
        </div>
        {/* Beside the account row, so he costs the navigation no height. */}
        {dock && (
          <div data-hoot-dock="sidebar" className="-my-2 grid size-[60px] shrink-0 place-items-center">
            {dock}
          </div>
        )}
      </div>
    </>
  );
}

function NavGroup({ label, links, active }: { label: string; links: NavLink[]; active: (n: NavLink) => boolean }) {
  if (!links.length) return null;
  return (
    <nav aria-label={label} className="mt-4 flex flex-col gap-px">
      <div className="px-2.5 pb-1 text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      {links.map((n) => (
        <NavItem key={n.href} href={n.href} label={n.label} icon={n.icon} active={active(n)} />
      ))}
    </nav>
  );
}

/** Whose holdings the Research, Markets and book links show. Only fund-wide roles can switch. */
export function ScopeSwitcher({ teams, current, fundWide, variant = "card" }: { teams: Team[]; current: Team | "fund" | null; fundWide: boolean; variant?: "card" | "rail" }) {
  const section = useTeamSection();
  const name = current === "fund" ? "Whole fund" : (current?.name ?? "No team");
  const rail = variant === "rail";
  const card = (
    <>
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        {current === "fund" ? <Layers className="size-3.5" /> : <span className="text-caption font-semibold">{initials(name)}</span>}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-caption text-muted-foreground">{fundWide ? "Viewing" : "Your team"}</span>
        <span className="block text-body font-medium text-balance">{name}</span>
      </span>
    </>
  );
  const cardClass = "flex w-full items-center gap-2.5 rounded-lg border bg-background px-2 py-1.5 text-left shadow-xs";
  // The rail's version: a 44×34 tile with the Layers icon or team initials, and a short label under it.
  const short = current === "fund" ? "Fund" : current ? initials(current.name) : "—";
  const railTile = (
    <>
      <span className="grid h-[34px] w-11 place-items-center rounded-[10px] bg-rail-2 font-mono text-body font-semibold text-cream shadow-[inset_0_0_0_1px_var(--rail-line)]">
        {current === "fund" ? <Layers className="size-4" /> : short}
      </span>
      <span className="flex items-center gap-px text-caption font-medium text-rail-label">
        {short}
        {fundWide && teams.length >= 2 && <ChevronDown className="size-[11px]" />}
      </span>
    </>
  );
  const railClass = "flex flex-col items-center gap-1 rounded-xl px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-cream/60 focus-visible:outline-none";

  const fundHref = `/t/${FUND_SCOPE_SLUG}${section}`;
  const teamOptions = teams.map((t) => ({ team: t, href: `/t/${t.slug}${section}` }));
  // The scopes this member can view, available to Hoot even while the dropdown is closed.
  const hootScopes = (
    <div hidden aria-hidden="true">
      {fundWide && <span data-hoot-scope="Whole fund" data-hoot-href={fundHref} />}
      {teamOptions
        .filter(({ team }) => fundWide || (current !== "fund" && current?.id === team.id))
        .map(({ team, href }) => <span key={team.id} data-hoot-scope={team.name} data-hoot-href={href} />)}
    </div>
  );

  if (!fundWide || teams.length < 2) {
    return (
      <>
        {hootScopes}
        {rail ? (
          <div data-tour="scope" className={railClass} title={name}>{railTile}</div>
        ) : (
          <div data-tour="scope" className={cardClass}>{card}</div>
        )}
      </>
    );
  }
  return (
    <>
      {hootScopes}
      <DropdownMenu>
        {rail ? (
          <DropdownMenuTrigger render={<button data-tour="scope" aria-label={`Viewing ${name}. Change scope`} title={name} className={cn(railClass, "hover:bg-rail-2/60 data-popup-open:bg-rail-2/60")} />}>
            {railTile}
          </DropdownMenuTrigger>
        ) : (
          <DropdownMenuTrigger
            render={
              <button
                data-tour="scope"
                className={cn(cardClass, "transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-popup-open:bg-muted")}
              />
            }
          >
            {card}
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
        )}
        <DropdownMenuContent className="w-72" align="start" side={rail ? "right" : undefined}>
          <DropdownMenuGroup>
            <ScopeItem href={fundHref} selected={current === "fund"}>
              Whole fund
            </ScopeItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Filter to a sector</DropdownMenuLabel>
            {teamOptions.map(({ team: t, href }) => (
              <ScopeItem key={t.id} href={href} selected={current !== "fund" && current?.id === t.id}>
                {t.name}
              </ScopeItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function ScopeItem({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenuItem render={<Link href={href} onClick={() => markScopeIntent()} />} className={cn(selected && "font-medium")}>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <Check className="text-muted-foreground" />}
    </DropdownMenuItem>
  );
}

export function initials(name: string) {
  const words = name.split(/[\s&,]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/** Who is signed in, with the per-person preferences and sign out tucked behind it. */
export function AccountMenu({ user, fundWide, signOut, variant = "row" }: { user: SidebarUser; fundWide: boolean; signOut: () => Promise<void>; variant?: "row" | "rail" | "avatar" }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "avatar" ? (
        <PopoverTrigger
          render={
            <button
              data-tour="account"
              aria-label={`${user.fullName}: preferences and sign out`}
              title={user.fullName}
              className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-caption font-semibold text-primary-foreground transition-shadow hover:shadow-[0_0_0_2px_var(--border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:shadow-[0_0_0_2px_var(--border-strong)]"
            />
          }
        >
          {initials(user.fullName) || "?"}
        </PopoverTrigger>
      ) : variant === "rail" ? (
        <PopoverTrigger
          render={
            <button
              data-tour="account"
              aria-label={`${user.fullName}: preferences and sign out`}
              title={user.fullName}
              className="grid size-8 place-items-center rounded-full bg-avatar text-caption font-semibold text-cream-foreground transition-shadow hover:shadow-[0_0_0_2px_var(--rail-line)] focus-visible:ring-2 focus-visible:ring-cream/60 focus-visible:outline-none data-popup-open:shadow-[0_0_0_2px_var(--rail-line)]"
            />
          }
        >
          {initials(user.fullName) || "?"}
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          render={
            <button data-tour="account" className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-popup-open:bg-sidebar-accent" />
          }
        >
          <Avatar name={user.fullName} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-body font-medium">{user.fullName}</span>
            <span className="block truncate text-caption text-muted-foreground">{ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
      )}
      <PopoverContent side={variant === "rail" ? "right" : variant === "avatar" ? "bottom" : "top"} align={variant === "rail" || variant === "avatar" ? "end" : "start"} className="w-64 gap-0 p-1.5">
        <div className="flex items-center gap-2.5 px-1.5 py-1.5">
          <Avatar name={user.fullName} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-body font-medium">{user.fullName}</span>
            <span className="block truncate text-caption text-muted-foreground">{user.username ?? user.email}</span>
          </span>
        </div>
        <div className="-mx-1.5 my-1.5 h-px bg-border" />
        <div className="px-1.5 pt-0.5 pb-1 text-caption text-muted-foreground">Preferences</div>
        <HootToggle on={user.hootEnabled} />
        {fundWide && <TransparencyToggle on={user.transparencyMode} />}
        <ThemeToggle />
        <div className="-mx-1.5 my-1.5 h-px bg-border" />
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-body hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <LogOut className="size-4 text-muted-foreground" />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold">{initials(name) || "?"}</span>
  );
}

function HootIcon({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/hoot/mark.webp" alt="" width={16} height={16} className={className} />;
}

const prefRow = "flex items-center gap-2.5 rounded-md px-1.5 py-1.5";

/** Show or hide Hoot's corner button. Persisted on the profile. */
function HootToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className={cn(prefRow, "cursor-pointer hover:bg-accent")} title="Hoot in the bottom-right corner of every page: flags deadlines and takes quick questions">
      <HootIcon className="size-4 shrink-0 rounded-full" />
      <span className="min-w-0 flex-1 text-body">Hoot in the corner</span>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Show Hoot"
        onCheckedChange={(next) =>
          startTransition(async () => {
            await setHootEnabled(next);
            router.refresh();
          })
        }
      />
    </label>
  );
}

/** Exec/admin only: reveals how the agent, attribution and jobs are computed. Persisted on the profile. */
function TransparencyToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className={cn(prefRow, "cursor-pointer hover:bg-accent")} title="Show how answers, attribution and jobs are computed">
      <ScanEye className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-body">Transparency</span>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Transparency mode"
        onCheckedChange={(next) =>
          startTransition(async () => {
            await setTransparencyMode(next);
            router.refresh();
          })
        }
      />
    </label>
  );
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
] as const;

const noSubscribe = () => () => {};

/** Light, dark or the OS setting. Remembered in this browser, not on the profile. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // The stored choice is only readable in the browser; mark nothing selected until then so hydration matches.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  return (
    <div className={prefRow}>
      <SunMoon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-body">Theme</span>
      <Segmented
        label="Theme"
        segments={THEMES.map(({ value, label, icon: Icon }) => ({
          key: value,
          label: <Icon className="size-3.5" />,
          ariaLabel: label,
          title: label,
          active: mounted && theme === value,
          onClick: () => setTheme(value),
        }))}
      />
    </div>
  );
}

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: Icon; active: boolean }) {
  return (
    <Link
      href={href}
      // A stable handle for Hoot's tour, since hrefs change with the scope.
      data-hoot-destination={label}
      data-tour={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-sidebar-border dark:bg-sidebar-accent dark:shadow-none dark:ring-0"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-foreground")} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
