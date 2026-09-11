"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/utils";

/**
 * Nav items had no active state at all, so you could never tell where you
 * were. `usePathname` needs a client component, so this is a deliberately
 * tiny leaf: the sidebar around it stays a server component.
 */
export function NavLink({
  href,
  children,
  exact,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-sidebar-border text-sidebar-foreground font-semibold"
          : "text-sidebar-muted hover:bg-sidebar-border/60 hover:text-sidebar-foreground",
      )}
    >
      {children}
    </Link>
  );
}
