import { useSyncExternalStore } from "react";

/**
 * Shared between the tour, the corner Hoot and the sidebar. While a tour runs, the corner Hoot steps aside (the
 * tour flies its own copy of him), and the sidebar's "Replay what's new" asks the tour to start again.
 */
let active = false;
const listeners = new Set<() => void>();
const replays = new Set<() => void>();

export function setTourActive(on: boolean) {
  if (active === on) return;
  active = on;
  for (const l of listeners) l();
}

export function useTourActive() {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => active,
    () => false,
  );
}

export function replayTour() {
  for (const r of replays) r();
}

export function onReplayTour(cb: () => void) {
  replays.add(cb);
  return () => {
    replays.delete(cb);
  };
}
