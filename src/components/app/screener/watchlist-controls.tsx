"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";
import { addToWatchlist, removeFromWatchlist } from "@/lib/actions/screener";

/** Add a name to a team's watchlist; the team choice shows only when the member can add to more than one. */
export function AddWatch({ teams, defaultTeamId }: { teams: { id: string; name: string }[]; defaultTeamId: string | null }) {
  const [state, action, pending] = useActionState(addToWatchlist, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message ?? "Added.");
      form.current?.reset();
    }
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="watch-ticker">
        Ticker to watch
      </label>
      <Input id="watch-ticker" name="ticker" required placeholder="Ticker" autoComplete="off" spellCheck={false} className="h-[30px] w-24" />
      {teams.length > 1 ? (
        <NativeSelect name="teamId" aria-label="Team" defaultValue={defaultTeamId ?? teams[0].id} className="h-[30px] w-auto">
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      ) : (
        <input type="hidden" name="teamId" value={teams[0]?.id ?? ""} />
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Watch"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="basis-full text-caption font-semibold text-caution-foreground">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RemoveWatch({ id, ticker }: { id: string; ticker: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      disabled={pending}
      aria-label={`Stop watching ${ticker}`}
      onClick={() =>
        start(async () => {
          const r = await removeFromWatchlist(id);
          if (!r.ok) toast.error(r.error);
        })
      }
      className="relative z-[1]"
    >
      {pending ? "Removing…" : "Remove"}
    </Button>
  );
}
