"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/** The shell's header for a page that doesn't render its own PageHead: the section's name and its tabs. */
export function DefaultHead() {
  const shell = useShell();
  if (!shell) return null;
  const { nav } = shell;
  if (!nav.crumbs.length && !nav.tabs.length) return null;
  return <HeadFrame marker="shell" crumbs={nav.crumbs} scope={nav.section === "portfolio" && nav.tabs.length > 1} tabs="section" />;
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
      ? (shell?.nav.tabs ?? []).map((t) => ({ key: t.key, label: t.label, href: t.href, active: t.active, count: shell?.counts[t.key]?.value, hot: shell?.counts[t.key]?.hot, tour: `nav-${t.key}` }))
      : tabs || [];
  const markerProps = marker === "page" ? { "data-page-head": "" } : { "data-shell-head": "" };
  return (
    <header {...markerProps} className={cn("shrink-0 border-b bg-background", className)}>
      <div className="flex h-[52px] items-center gap-2.5 px-10 text-body">
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-2.5">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={i} className="flex min-w-0 items-center gap-2.5">
                  {i > 0 && (
                    <span aria-hidden="true" className="text-muted-foreground/70">
                      /
                    </span>
                  )}
                  {c.href && !last ? (
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
        {asof && <span className="min-w-0 truncate text-caption text-muted-foreground">{asof}</span>}
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
