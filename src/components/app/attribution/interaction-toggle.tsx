"use client";

import { createContext, useContext, useId, useState } from "react";

/**
 * The interaction effect can be hidden across the page ("Show interaction"). Elements that carry
 * `INTERACTION_CLASS` disappear while it is off; the figures stay server-rendered and unchanged.
 */
export const INTERACTION_CLASS = "group-data-[hide-interaction=true]/interaction:hidden";

const Ctx = createContext<{ show: boolean; setShow: (v: boolean) => void } | null>(null);

/** Wraps the part of the page the switch controls. Takes layout classes because it is a real element. */
export function InteractionScope({ className, children }: { className?: string; children: React.ReactNode }) {
  const [show, setShow] = useState(true);
  return (
    <Ctx.Provider value={{ show, setShow }}>
      <div className={`group/interaction ${className ?? ""}`} data-hide-interaction={show ? undefined : "true"}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

/** The "Show interaction" checkbox. Renders nothing outside an `InteractionScope`. */
export function InteractionSwitch() {
  const ctx = useContext(Ctx);
  const id = useId();
  if (!ctx) return null;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground">
      <input id={id} type="checkbox" checked={ctx.show} onChange={(e) => ctx.setShow(e.target.checked)} className="size-3.5 accent-primary" />
      Show interaction
    </label>
  );
}
