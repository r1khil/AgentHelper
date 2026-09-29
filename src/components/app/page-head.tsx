"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pageLabelFor } from "./hoot/page-context";
import { useShell } from "./shell/shell-context";
import { markScopeIntent } from "./shell/scope-intent";
import { useTeamSection } from "./sidebar";
import { Tabs, type TabItem } from "./tabs";

export type Crumb = { label: React.ReactNode; href?: string };

/**
 * The page header every page opens with: where you are (a breadcrumb, the last crumb is this page), a grey note on
 * the data (as of when, what scope), the page's actions (one primary at most, filled ink), and under them the
 * section's tabs. 52px, plus a 44px tab row, over a hairline.
 *
 * Render it first in the page. It bleeds to the edges of the content area, and replaces the shell's default header.
 * On a full-bleed page (one that renders `data-full-bleed`), put it at the top of that wrapper.
 */
export function PageHead({
  crumbs,
  scope,
  asof,
  actions,
  tabs = "section",
  className,
}: {
  crumbs: Crumb[];
  /** Put the scope switcher ("Whole fund ▾") after the first crumb, for pages whose data follows the scope. */
  scope?: boolean;
  asof?: React.ReactNode;
  actions?: React.ReactNode;
  /** "section" (the default) shows the section's pages from the nav model; a list shows these tabs; false, none. */
  tabs?: TabItem[] | "section" | false;
  className?: string;
}) {
  return <HeadFrame marker="page" crumbs={crumbs} scope={scope} asof={asof} actions={actions} tabs={tabs} className={className} />;
}

/**
 * The shell's header for a page that doesn't render its own PageHead: the section's name and its tabs. On a page about
 * one item (a holding, a report) the section links back up and the page's own title follows it.
 */
export function DefaultHead() {
  const shell = useShell();
  const pathname = usePathname();
  const [title, setTitle] = useState<{ path: string; label: string } | null>(null);
  // The page's title is only known once it has rendered (document.title); read it after each navigation.
  useEffect(() => {
    const id = window.setTimeout(() => setTitle({ path: pathname, label: pageLabelFor(pathname) }), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);
  if (!shell) return null;
  const { nav } = shell;
  if (!nav.crumbs.length && !nav.tabs.length) return null;
  const own = nav.back && title?.path === pathname && title.label && title.label !== nav.back.label ? [{ label: title.label }] : [];
  return <HeadFrame marker="shell" crumbs={[...nav.crumbs, ...own]} scope={nav.section === "portfolio" && nav.tabs.length > 1} tabs="section" />;
}

/**
 * For a page designed without a header (Home): hides the shell's default one. Render it anywhere in the page.
 */
export function NoPageHead() {
  return <span data-page-head="" hidden />;
}

/** PageHead's shape while the page loads, so the header doesn't jump when the page lands: 52px, plus the tab row. */
export function SkeletonPageHead({ tabs = 0, className }: { tabs?: number; className?: string }) {
  return (
    <div data-page-head="" aria-hidden="true" className={cn("shrink-0 border-b bg-background", className)}>
      <div className="flex h-[52px] items-center gap-2.5 px-10">
        <span className="h-3 w-28 animate-pulse rounded-[4px] bg-muted" />
      </div>
      {tabs > 0 && (
        <div className="flex h-11 items-center gap-[22px] px-10">
          {Array.from({ length: tabs }, (_, i) => (
            <span key={i} className="h-3 w-16 animate-pulse rounded-[4px] bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}

function HeadFrame({
  marker,
  crumbs,
  scope,
  asof,
  actions,
  tabs,
  className,
}: {
  marker: "page" | "shell";
  crumbs: Crumb[];
  scope?: boolean;
  asof?: React.ReactNode;
  actions?: React.ReactNode;
  tabs: TabItem[] | "section" | false;
  className?: string;
}) {
  const shell = useShell();
  const items =
    tabs === "section"
      ? (shell?.nav.tabs ?? []).map((t) => ({ key: t.key, label: t.label, href: t.href, active: t.active, count: shell?.counts[t.key]?.value, hot: shell?.counts[t.key]?.hot, overdue: shell?.counts[t.key]?.overdue, tour: `nav-${t.key}` }))
      : tabs || [];
  const markerProps = marker === "page" ? { "data-page-head": "" } : { "data-shell-head": "" };
  const ref = useRef<HTMLElement>(null);
  // A PageHead only bleeds to the content area's edges as its first child (or at the top of a full-bleed page).
  useEffect(() => {
    const el = ref.current;
    if (process.env.NODE_ENV !== "development" || marker !== "page" || !el) return;
    const placed = el.parentElement?.classList.contains("app-container") || !!el.closest("[data-full-bleed]");
    if (!placed) console.warn("PageHead should be the first element a page returns, or the top of its data-full-bleed wrapper.", el);
  }, [marker]);
  return (
    <header ref={ref} {...markerProps} className={cn("shrink-0 border-b bg-background", className)}>
      <div className="flex h-[52px] items-center gap-2.5 px-10 text-body">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-2.5">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                // Only the page's own name gives way to a long title; the crumbs above it keep their width.
                <li key={i} className={cn("flex items-center gap-2.5", last ? "min-w-0" : "shrink-0")}>
                  {i > 0 && (
                    <span aria-hidden="true" className="text-muted-foreground/70">
                      /
                    </span>
                  )}
                  {c.href ? (
                    <Link href={c.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                      {c.label}
                    </Link>
                  ) : last ? (
                    // The page's name is its heading; it reads as a breadcrumb, in the header's 13px.
                    <h1 aria-current="page" className="truncate text-body font-semibold text-foreground">
                      {c.label}
                    </h1>
                  ) : (
                    <span className="truncate text-muted-foreground">{c.label}</span>
                  )}
                  {i === 0 && scope && (
                    <>
                      <span aria-hidden="true" className="text-muted-foreground/70">
                        /
                      </span>
                      <ScopeMenu />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <span className="flex-1" />
        {asof && <span className="min-w-0 shrink-[2] truncate text-caption text-muted-foreground">{asof}</span>}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {items.length > 0 && <Tabs data-tour="section-tabs" label="Section" rule={false} className="h-11 items-stretch gap-[22px] px-10" items={items} />}
    </header>
  );
}

/**
 * "Whole fund ▾": the scope the page's data follows, and the switch to another. Keeps the reader on the same page
 * (Risk stays Risk). Members who see one team get the name without a menu.
 */
export function ScopeMenu({ label = "Whole fund" }: { label?: string }) {
  const shell = useShell();
  const section = useTeamSection();
  if (!shell) return null;
  const { teams, current, fundWide } = shell;
  const name = current === "fund" ? label : (current?.name ?? "No team");
  const trigger = "flex h-7 items-center gap-1 rounded-lg bg-secondary px-2 text-body text-foreground";
  if (!fundWide || teams.length < 2) return <span className={trigger}>{name}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-tour="scope"
        aria-label={`Showing ${name}. Change scope`}
        className={cn(trigger, "transition-colors hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
        {name}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuGroup>
          <ScopeItem href={`/t/${FUND_SCOPE_SLUG}${section}`} selected={current === "fund"}>
            {label}
          </ScopeItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>One team</DropdownMenuLabel>
          {teams.map((t) => (
            <ScopeItem key={t.id} href={`/t/${t.slug}${section}`} selected={current !== "fund" && current?.id === t.id}>
              {t.name}
            </ScopeItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScopeItem({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenuItem render={<Link href={href} onClick={() => markScopeIntent()} />} className={cn(selected && "font-semibold")}>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <Check className="text-muted-foreground" />}
    </DropdownMenuItem>
  );
}

/**
 * The block every page opens with: a grey label, the one big number, and the line that explains it (the change in its
 * colour, then a grey note). `tone` colours the change: up green, down red, none ink.
 */
export function PageHero({
  label,
  value,
  change,
  tone,
  note,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  change?: React.ReactNode;
  tone?: "up" | "down" | null;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="text-body text-muted-foreground">{label}</span>
      <span className="hero-figure">{value}</span>
      {(change || note) && (
        <span className="text-emph">
          {change && <span className={cn("font-semibold", tone === "up" && "text-up", tone === "down" && "text-down")}>{change}</span>}
          {change && note && " "}
          {note && <span className="text-muted-foreground">{note}</span>}
        </span>
      )}
    </div>
  );
}
