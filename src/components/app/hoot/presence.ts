"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { HootMood } from "@/lib/hoot/types";

// One Hoot per screen. A page that shows Hoot in its content (an empty state, a greeter) mounts <HootOnPage />
// and the corner companion steps aside; a page can also set his resting mood from its own state.

let onPage = 0;
let pageMood: HootMood | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True while some part of the page is showing Hoot itself. */
export function useHootOnPage() {
  return useSyncExternalStore(subscribe, () => onPage > 0, () => false);
}

/** The mood the page asked for, or null to let the feed decide. */
export function usePageMood() {
  return useSyncExternalStore(subscribe, () => pageMood, () => null);
}

/** Render wherever Hoot appears in the page content, so the corner companion hides while it's mounted. */
export function HootOnPage() {
  useEffect(() => {
    onPage++;
    emit();
    return () => {
      onPage--;
      emit();
    };
  }, []);
  return null;
}

/** Set the companion's resting mood from page state, e.g. `concerned` while something is overdue. */
export function HootMoodFor({ mood }: { mood: HootMood | null }) {
  useEffect(() => {
    pageMood = mood;
    emit();
    return () => {
      if (pageMood === mood) pageMood = null;
      emit();
    };
  }, [mood]);
  return null;
}
