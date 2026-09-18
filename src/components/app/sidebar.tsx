"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  ChartColumn,
  ChartNoAxesCombined,
  Activity,
  CalendarDays,
  ChevronsUpDown,
  Home,
  LogOut,
  Menu,
  ScanEye,
  Settings,
  Sparkles,
  Table2,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role, Team } from "@/db/schema";
import { OwlMark } from "./owl-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { setTransparencyMode } from "@/lib/actions/preferences";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SidebarUser = { fullName: string; role: Role; teamId: string | null; email: string; username: string | null; transparencyMode: boolean };

type Props = { user: SidebarUser; teams: Team[]; signOut: () => Promise<void> };

function useCurrentTeam(teams: Team[], user: SidebarUser) {
  const pathname = usePathname();
  const m = pathname.match(/^\/t\/([^/]+)/);
  const fromPath = m ? teams.find((t) => t.slug === m[1]) : undefined;
  return fromPath ?? teams.find((t) => t.id === user.teamId) ?? teams[0] ?? null;
}

export function Sidebar(props: Props) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <SidebarBody {...props} />
      </aside>
      <MobileBar {...props} />
    </>
  );
}

function MobileBar(props: Props) {
  return (
    <div className="flex items-center justify-between border-b bg-sidebar px-4 py-2.5 md:hidden">
      <Link href="/" className="flex items-center gap-2">
        <OwlMark className="size-7" />
        <span className="text-sm font-semibold">Owl Fund</span>
      </Link>
      <Sheet>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open menu" />}>
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            <SidebarBody {...props} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SidebarBody({ user, teams, signOut }: Props) {
  const pathname = usePathname();
  const team = useCurrentTeam(teams, user);
  const fundWide = user.role === "exec" || user.role === "admin";
  const base = team ? `/t/${team.slug}` : null;

  const teamNav = base
    ? [
        { href: base, label: "Holdings", icon: Briefcase, exact: true },
        { href: `${base}/agent`, label: "Agent", icon: Sparkles },
        { href: `${base}/movements`, label: "Movements", icon: Activity },
        { href: `${base}/earnings`, label: "Earnings", icon: CalendarDays },
        { href: `${base}/models`, label: "Models", icon: Table2 },
        // Position sizes and P&L: leads of this team and fund-wide roles only.
        ...(fundWide || (user.role === "lead_analyst" && user.teamId === team?.id)
          ? [{ href: `${base}/attribution`, label: "Attribution", icon: ChartColumn }]
          : []),
      ]
    : [];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <div className="px-3 pt-4 pb-2">
        <Link href="/" className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent">
          <OwlMark className="size-7" />
          <span className="text-sm font-semibold">Owl Fund</span>
        </Link>
      </div>

      <nav className="px-3">
        <NavItem href="/" label="Today" icon={Home} active={pathname === "/"} />
        {fundWide && <NavItem href="/attribution" label="Fund attribution" icon={ChartNoAxesCombined} active={isActive("/attribution")} />}
      </nav>

      <div className="mt-4 px-3">
        {fundWide && teams.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex w-full items-center justify-between rounded-md border bg-background px-2.5 py-1.5 text-left text-sm hover:bg-muted" />
              }
            >
              <span className="truncate font-medium">{team?.name ?? "Choose a team"}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sector teams</DropdownMenuLabel>
                {teams.map((t) => (
                  <DropdownMenuItem key={t.id} render={<Link href={`/t/${t.slug}`} />}>
                    {t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {team?.name ?? "No team"}
          </div>
        )}
      </div>

      <nav className="mt-1.5 px-3">
        {teamNav.map((n) => (
          <NavItem key={n.href} href={n.href} label={n.label} icon={n.icon} active={isActive(n.href, n.exact)} />
        ))}
      </nav>

      {fundWide && (
        <nav className="mt-4 px-3">
          <NavItem href="/admin" label="Admin" icon={Settings} active={isActive("/admin")} />
        </nav>
      )}

      <div className="mt-auto border-t p-3">
        {fundWide && <TransparencyToggle on={user.transparencyMode} />}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent" />}
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
              {user.fullName.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate text-xs text-muted-foreground">{user.username ?? user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

/** Exec/admin only: reveals how the agent, attribution and jobs are computed. Persisted on the profile. */
function TransparencyToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="mb-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-sidebar-accent" title="Show how answers, attribution and jobs are computed">
      <ScanEye className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-sm">Transparency</span>
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

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
