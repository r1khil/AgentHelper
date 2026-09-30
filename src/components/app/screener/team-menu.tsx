"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Whose names the Screener lists: the whole fund or one team (Markets' team menu, in the page header). */
export function TeamMenu({ team, teams, hrefs }: { team: { slug: string; name: string } | null; teams: { slug: string; name: string }[]; hrefs: { all: string; bySlug: Record<string, string> } }) {
  const name = team?.name ?? "Whole fund";
  const trigger = "flex h-7 items-center gap-1 rounded-lg bg-secondary px-2 text-body text-foreground";
  if (teams.length < 2) return team ? <span className={trigger}>{name}</span> : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Showing ${name}. Change whose names are listed`} className={cn(trigger, "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>
        {name}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuGroup>
          <Item href={hrefs.all} selected={!team}>
            Whole fund
          </Item>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>One team</DropdownMenuLabel>
          {teams.map((t) => (
            <Item key={t.slug} href={hrefs.bySlug[t.slug]} selected={team?.slug === t.slug}>
              {t.name}
            </Item>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({ href, selected, children }: { href: string; selected: boolean; children: React.ReactNode }) {
  return (
    <DropdownMenuItem render={<Link href={href} scroll={false} />} className={cn(selected && "font-semibold")}>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <Check className="text-muted-foreground" />}
    </DropdownMenuItem>
  );
}
