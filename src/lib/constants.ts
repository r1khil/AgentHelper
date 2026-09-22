import type { Role } from "@/db/schema";

export const APP_NAME = "The Owl's Nest";
export const TEST_ACCOUNT_DOMAIN = "accounts.owlfund.local";
export const MOVEMENT_THRESHOLD_PP = 4.0;
/** Reserved team slug: `/t/fund/...` shows every team at once. Exec/admin only, and their default scope. */
export const FUND_SCOPE_SLUG = "fund";

export const ROLE_LABELS: Record<Role, string> = {
  associate_analyst: "Associate analyst",
  lead_analyst: "Lead analyst",
  exec: "Exec",
  admin: "Admin",
};

export const ROLES: Role[] = ["associate_analyst", "lead_analyst", "exec", "admin"];

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${TEST_ACCOUNT_DOMAIN}`;
}
