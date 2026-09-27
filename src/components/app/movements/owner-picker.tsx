"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { claimMovement } from "@/lib/actions/movements";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/app/native-select";

/** The Owner cell of the meta strip: the name, and a popover to assign or claim the movement. */
export function OwnerPicker({
  movementId,
  ownerId,
  ownerName,
  members,
  locked,
}: {
  movementId: string;
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; fullName: string }[];
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = ownerName ?? <span className="text-caution-foreground">Unassigned</span>;
  if (locked) return <span>{name}</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<button type="button" className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" />}
        title="Assign or claim"
      >
        {name}
        <ChevronDown className="size-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <form action={claimMovement} onSubmit={() => setOpen(false)} className="grid gap-2">
          <input type="hidden" name="id" value={movementId} />
          <div className="text-[12.5px] font-medium">Owner</div>
          <NativeSelect name="ownerId" defaultValue={ownerId ?? ""}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </NativeSelect>
          {!ownerName && <p className="text-xs text-caution-foreground">Unassigned. Claim it or ask the lead.</p>}
          <Button type="submit" size="sm" className="justify-self-end">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
