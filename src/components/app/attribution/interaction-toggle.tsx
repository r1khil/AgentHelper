"use client";

import { useId, useState } from "react";

/**
 * Wraps the sector table so the interaction column can be hidden. The cells stay server-rendered;
 * only the `data-hide-interaction` flag on the group changes.
 */
export function InteractionToggle({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(true);
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex justify-end">
        <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input id={id} type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="size-3.5 accent-primary" />
          Show interaction
        </label>
      </div>
      <div className="group/sectors min-w-0" data-hide-interaction={show ? undefined : "true"}>
        {children}
      </div>
    </div>
  );
}
