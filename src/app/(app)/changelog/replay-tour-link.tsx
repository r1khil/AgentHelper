"use client";

import { replayTour } from "@/components/app/tour/tour-store";

/** Starts Hoot's what's-new tour again, the same as "Replay what's new" in the account menu. */
export function ReplayTourLink() {
  return (
    <button type="button" onClick={() => replayTour()} className="self-start rounded-full text-[13px] font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      Replay what&apos;s new with Hoot →
    </button>
  );
}
