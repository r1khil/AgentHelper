"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { addToWatchlist } from "@/lib/actions/screener";

/** Watch a company for a team: one button for one team, a menu when the member can add for several. */
export function WatchButton({ ticker, teams }: { ticker: string; teams: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const watch = (teamId: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("ticker", ticker);
      fd.set("teamId", teamId);
      const r = await addToWatchlist(null, fd);
      if (r.ok) toast.success(r.message ?? "Added.");
      else toast.error(r.error);
    });
  if (teams.length === 1)
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-3 w-full" disabled={pending} onClick={() => watch(teams[0].id)}>
        {pending ? "Adding…" : `Watch for ${teams[0].name}`}
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" size="sm" variant="secondary" className="mt-3 w-full" disabled={pending} />}>{pending ? "Adding…" : "Watch for a team"}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add to a watchlist</DropdownMenuLabel>
          {teams.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => watch(t.id)}>
              {t.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
