"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { stopTakeover, takeoverStore } from "./takeover";

const none = () => null;

/**
 * While Hoot drives the screen to a page, what it's doing and a way out. Portaled to the body above page-agent's mask
 * (which blocks every other click), so Skip and Esc always work; skipping opens the page directly.
 */
export function HootTakeoverBar() {
  const t = useSyncExternalStore(takeoverStore.subscribe, takeoverStore.get, none);
  if (!t) return null;
  return createPortal(
    // page-agent leaves this out of what the model sees, so it can't press Skip itself.
    <div role="status" aria-live="polite" data-page-agent-ignore="true" data-hoot-takeover-bar="" className="fixed top-4 left-1/2 z-[2147483647] flex -translate-x-1/2 items-center gap-2.5 rounded-full border bg-background py-1.5 pr-1.5 pl-2 text-body shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hoot/mark.webp" alt="" width={22} height={22} className="size-[22px] rounded-full" />
      <span className="max-w-[420px] truncate">
        <span className="font-medium">Hoot is opening {t.label}</span>
        {t.step && <span className="text-muted-foreground">: {t.step}</span>}
      </span>
      <button
        type="button"
        onClick={stopTakeover}
        className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-caption font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        Skip
        <kbd className="font-mono text-muted-foreground">esc</kbd>
      </button>
    </div>,
    document.body,
  );
}
