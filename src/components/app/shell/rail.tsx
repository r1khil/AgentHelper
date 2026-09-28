"use client";

import Link from "next/link";
import { Briefcase, CalendarDays, ChartColumn, House, MessageSquareText, Settings } from "lucide-react";
import type { Team } from "@/db/schema";
import type { NavModel, RailItem, RailKey } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AccountMenu, ScopeSwitcher, type SidebarUser } from "../sidebar";

const ICONS: Record<RailKey, React.ComponentType<{ className?: string }>> = {
  today: House,
  holdings: Briefcase,
  research: MessageSquareText,
  calendar: CalendarDays,
  portfolio: ChartColumn,
  manage: Settings,
};

/**
 * The slim navigation rail: five destinations, Manage at the bottom for execs and admins, and the account menu.
 * The logo is typographic on purpose. Hoot, when he's on, is docked just above Manage (`hoot`), so he never sits
 * over the page; his bubbles and panel open to the rail's right, which is why the rail stacks above the content.
 */
export function Rail({
  nav,
  user,
  teams,
  current,
  fundWide,
  signOut,
  destinations,
  hoot,
}: {
  nav: NavModel;
  user: SidebarUser;
  teams: Team[];
  current: Team | "fund" | null;
  fundWide: boolean;
  signOut: () => Promise<void>;
  destinations: { label: string; href: string }[];
  /** The docked companion. His spot stays reserved while he steps aside, so nothing below it moves. */
  hoot?: React.ReactNode;
}) {
  return (
    <aside
      data-tour="sidebar"
      className="sticky top-0 z-30 hidden h-dvh w-[76px] shrink-0 flex-col items-center bg-rail py-3 text-rail-foreground md:flex"
    >
      <Link
        href="/"
        aria-label="The Owl's Nest, Today"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-body font-bold tracking-[-0.04em] text-rail focus-visible:ring-2 focus-visible:ring-cream/60 focus-visible:ring-offset-2 focus-visible:ring-offset-rail focus-visible:outline-none"
      >
        ON
      </Link>
      <div className="mt-3.5">
        <ScopeSwitcher teams={teams} current={current} fundWide={fundWide} variant="rail" />
      </div>
      <div className="my-3 h-px w-7 shrink-0 bg-rail-line" />
      <nav aria-label="Main" className="flex flex-col items-center gap-2">
        {nav.rail.map((item) => (
          <RailLink key={item.key} item={item} />
        ))}
      </nav>
      <div className="min-h-3 flex-1" />
      {hoot && (
        <div data-hoot-dock="rail" className="mb-3 grid size-[60px] shrink-0 place-items-center">
          {hoot}
        </div>
      )}
      {nav.manage && (
        <div className="mb-3">
          <RailLink item={nav.manage} />
        </div>
      )}
      <AccountMenu user={user} fundWide={fundWide} signOut={signOut} variant="rail" />
      {/* Every page Hoot can open by name ("take me to risk"), including ones that are tabs of another section. */}
      <div hidden aria-hidden="true">
        {destinations.map((d) => (
          <a key={d.label} href={d.href} data-hoot-destination={d.label} tabIndex={-1} />
        ))}
      </div>
    </aside>
  );
}

function RailLink({ item }: { item: RailItem }) {
  const Icon = ICONS[item.key];
  return (
    <Link
      href={item.href}
      data-tour={`nav-${item.key}`}
      aria-current={item.active ? "page" : undefined}
      className="group flex w-16 flex-col items-center gap-1 rounded-lg focus-visible:outline-none"
    >
      <span
        className={cn(
          "grid h-8 w-11 place-items-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-cream/60",
          item.active ? "bg-cream text-cream-foreground" : "text-rail-foreground group-hover:bg-rail-2 group-hover:text-cream",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className={cn("text-caption leading-none", item.active ? "font-semibold text-cream" : "font-medium text-rail-foreground group-hover:text-cream")}>
        {item.label}
      </span>
    </Link>
  );
}
