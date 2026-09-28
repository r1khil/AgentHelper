"use client";

import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";
import { scopedHref } from "@/lib/scope";
import { useScopeSlug } from "@/components/app/shell/scope-context";

type LinkProps = React.ComponentProps<typeof Link>;

/**
 * How much of the row the link is:
 * - "row": the link is the row (a list item or a grid row). The default.
 * - "stretch": the link sits in the first cell and stretches over the whole row, so the row itself opens. The row
 *   must be `relative`; anything in it with its own link or button sits above with `relative z-[1]`.
 * - "cell": only the link (a ticker) opens; the rest of the row is plain. The row must be `relative`
 *   (TableRow is) so the pressed and pending tints still cover it.
 */
type Cover = "row" | "stretch" | "cell";

type Target = { href: LinkProps["href"]; owner?: never; path?: never } | { href?: never; owner: string; path: string };

const COVER: Record<Cover, string> = {
  row: "relative",
  stretch: "after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
  cell: "",
};

/**
 * A link that opens a table or list row. Pressing it tints the row at once, and while the next page is on its way
 * the tint stays and a thin bar runs along the row's bottom edge (the route's loading skeleton takes over as soon as
 * the navigation commits). It is a plain <Link>, so Enter opens it and ⌘-click or a middle click opens a new tab
 * (which shows no pending state, since this page isn't navigating). Pass `owner` and `path` instead of `href` for
 * a team's item that should open in the scope in view (as ScopedLink does).
 */
export function RowLink({ cover = "row", owner, path, href, className, children, ...props }: Omit<LinkProps, "href"> & Target & { cover?: Cover }) {
  const scope = useScopeSlug();
  const to = owner !== undefined ? scopedHref(scope, owner, path) : href!;
  return (
    <Link {...props} href={to} className={cn(COVER[cover], className)}>
      {children}
      <RowPending />
    </Link>
  );
}

/**
 * The pressed and pending tint (globals.css, .row-pending). Always rendered and absolutely placed over the nearest
 * positioned ancestor, the row, so showing it never moves anything. Must sit inside the <Link> it reports on.
 */
export function RowPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden data-pending={pending || undefined} className="row-pending" />;
}
