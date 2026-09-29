import type { Profile } from "@/db/schema";

export function isFundWide(user: Pick<Profile, "role">) {
  return user.role === "exec" || user.role === "admin";
}

/** Transparency mode is an exec/admin preference; the role check here makes a stale flag on a demoted user harmless. */
export function transparencyEnabled(user: Pick<Profile, "role" | "transparencyMode">) {
  return isFundWide(user) && user.transparencyMode;
}

export function canAccessTeam(user: Pick<Profile, "role" | "teamId">, teamId: string) {
  return isFundWide(user) || user.teamId === teamId;
}

export function canManageTeam(user: Pick<Profile, "role" | "teamId">, teamId: string) {
  if (user.role === "admin" || user.role === "exec") return true;
  return user.role === "lead_analyst" && user.teamId === teamId;
}

/**
 * A chat is open to its team, except once it has read the price target sheet: then only execs and admins. A fund-wide
 * chat (no team) is for execs and admins only.
 */
export function canOpenChat(user: Pick<Profile, "role" | "teamId">, chat: { teamId: string | null; fundOnly: boolean }) {
  if (chat.teamId === null) return isFundWide(user);
  return canAccessTeam(user, chat.teamId) && (!chat.fundOnly || isFundWide(user));
}
