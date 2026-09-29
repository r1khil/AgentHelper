"use client";

import { createContext, useContext } from "react";
import type { Team } from "@/db/schema";
import type { NavModel } from "@/lib/nav";
import type { NavBadge, TabCount } from "@/lib/nav-data";

/** What the shell knows that a page's header needs: the section's tabs and their counts, the scopes to switch between. */
export type ShellState = {
  nav: NavModel;
  counts: Record<string, TabCount>;
  badges: Partial<Record<"movements" | "models", NavBadge>>;
  teams: Team[];
  /** The scope in view: the whole fund, a team, or none (no team yet). */
  current: Team | "fund" | null;
  fundWide: boolean;
};

const ShellContext = createContext<ShellState | null>(null);

export const ShellProvider = ShellContext.Provider;

/** The shell's state, or null outside the app shell (sign-in, previews). */
export function useShell() {
  return useContext(ShellContext);
}
