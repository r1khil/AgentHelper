"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CountChip } from "./panel";

/*
 * The one tab control. Tabs move between views of one thing: a section's pages in the header, a holding's sections,
 * a model's sections, the ledger's tables, a call's brief and transcript. One look everywhere: 14px labels, the
 * active one 600 with a 2px ink underline, an optional count chip, 20px apart.
 *
 * - Every tab has an `href`: the tabs are links to other URLs, so they render as a `nav` with `aria-current="page"`
 *   (the ARIA tab pattern is for panels on the same page, not for links) and Tab moves through them as before.
 * - No `href`: the tabs swap panels in place, so they render as a `tablist` of `tab` buttons with `aria-selected`.
 *   Tab reaches the selected tab; the arrow keys, Home and End move between tabs and Enter or Space opens one.
 *   Pass `idBase` and give each panel `tabPanelProps(idBase, key)` to tie the two together.
 */

export type TabItem = {
  key: string;
  label: React.ReactNode;
  active: boolean;
  /** A link tab; either every tab has one or none does. */
  href?: string;
  count?: React.ReactNode;
  /** The count is something Hoot found or that needs action (pink). */
  hot?: boolean;
  title?: string;
  /** `data-tour` hook for the what's-new tour. */
  tour?: string;
};

/** The ids that tie an in-place tab to its panel. */
export function tabIds(idBase: string, key: string) {
  return { tab: `${idBase}-tab-${key}`, panel: `${idBase}-panel-${key}` };
}

/** Props for the panel an in-place tab shows. */
export function tabPanelProps(idBase: string, key: string) {
  const ids = tabIds(idBase, key);
  return { role: "tabpanel" as const, id: ids.panel, "aria-labelledby": ids.tab };
}

/** Which tab a key press moves focus to, or null when the key isn't one the tab list handles. Wraps around. */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

const tabClass = (active: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 rounded-sm text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
    active ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "text-muted-foreground hover:text-foreground",
  );

function Label({ item }: { item: TabItem }) {
  const shown = item.count !== undefined && item.count !== null && item.count !== "";
  return (
    <>
      <span>{item.label}</span>
      {shown && <CountChip hot={item.hot}>{item.count}</CountChip>}
    </>
  );
}

export function Tabs({
  items,
  label,
  onSelect,
  idBase,
  rule = true,
  scroll = true,
  className,
  ...props
}: {
  items: TabItem[];
  /** The accessible name of the tab row. */
  label: string;
  /** In-place tabs: called with the chosen tab's key. */
  onSelect?: (key: string) => void;
  /** In-place tabs: the prefix for the tab and panel ids. */
  idBase?: string;
  /** Draw the 1px rule under the row. Off where the row sits on a divider already (the app header, a panel header). */
  rule?: boolean;
  /** Link tabs: scroll to the top on the new page (a different page) or keep the position (`?tab=` on the same page). */
  scroll?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"div">, "children" | "onSelect">) {
  const row = cn("flex min-h-9 shrink-0 gap-5 overflow-x-auto", rule && "border-b", className);
  const links = items.length > 0 && items.every((t) => t.href);

  if (links) {
    return (
      <nav aria-label={label} className={row} {...props}>
        {items.map((t) => (
          <Link key={t.key} href={t.href!} scroll={scroll} title={t.title} data-tour={t.tour} aria-current={t.active ? "page" : undefined} className={tabClass(t.active)}>
            <Label item={t} />
          </Link>
        ))}
      </nav>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const next = tabKeyTarget(e.key, tabs.indexOf(e.target as HTMLButtonElement), tabs.length);
    if (next === null) return;
    e.preventDefault();
    tabs[next]?.focus();
  };

  // Tab reaches the selected tab, or the first when none is.
  const focusable = Math.max(0, items.findIndex((t) => t.active));
  return (
    <div role="tablist" aria-label={label} aria-orientation="horizontal" onKeyDown={onKeyDown} className={row} {...props}>
      {items.map((t, i) => {
        const ids = idBase ? tabIds(idBase, t.key) : null;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={ids?.tab}
            aria-controls={ids?.panel}
            aria-selected={t.active}
            tabIndex={i === focusable ? 0 : -1}
            title={t.title}
            data-tour={t.tour}
            onClick={() => onSelect?.(t.key)}
            className={tabClass(t.active)}
          >
            <Label item={t} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * In-place tabs over server-rendered panels: the tabs, then the chosen tab's panel. Only the chosen panel is mounted.
 * `initial` comes from the URL (`?tab=`); switching doesn't change the URL.
 */
export function TabbedPanels({
  label,
  idBase,
  tabs,
  initial,
  panels,
  className,
  panelClassName,
}: {
  label: string;
  idBase: string;
  tabs: { key: string; label: React.ReactNode; count?: React.ReactNode }[];
  initial: string;
  panels: Record<string, React.ReactNode>;
  className?: string;
  panelClassName?: string;
}) {
  const [tab, setTab] = useState(initial);
  return (
    <div className={className}>
      <Tabs label={label} idBase={idBase} onSelect={setTab} items={tabs.map((t) => ({ ...t, active: t.key === tab }))} />
      <div {...tabPanelProps(idBase, tab)} className={panelClassName}>
        {panels[tab]}
      </div>
    </div>
  );
}
