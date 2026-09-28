"use client";

import { replayTour } from "@/components/app/tour/tour-store";

/** Starts Hoot's tour of the new look again, the same as "Replay the tour" in the account menu. */
export function ReplayTourLink() {
  return (
    <button type="button" onClick={() => replayTour()} className="self-start rounded-full text-body font-semibold hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      Tour the new look with Hoot →
    </button>
  );
}
