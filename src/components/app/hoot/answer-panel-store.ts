"use client";

import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

// The answer panel's one piece of state: which conversation it shows. ⌘J's palette opens it (use-ask-hoot.ts) and the
// panel, mounted once by the shell, reads it. Outside React because the palette closes as the panel opens.

export type AnswerPanelState = {
  chatId: string;
  /** The full thread, for "Open as a full thread". */
  href: string;
  /** What the question was asked about, in the chip: "Performance · since Sep 17". */
  context: string;
  /** A conversation already under way, when the panel opens on one (a new question starts empty). */
  messages?: UIMessage[];
  /** Bumps each time a question opens the panel, so a second question in the same chat is noticed. */
  seq: number;
} | null;

let state: AnswerPanelState = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function openAnswerPanel(next: Omit<NonNullable<AnswerPanelState>, "seq">) {
  state = { ...next, seq: ++seq };
  emit();
}

export function closeAnswerPanel() {
  if (!state) return;
  state = null;
  emit();
}

export function useAnswerPanel(): AnswerPanelState {
  return useSyncExternalStore(subscribe, () => state, () => null);
}
