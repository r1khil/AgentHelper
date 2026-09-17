import type { Role } from "@/db/schema";

export const APP_NAME = "Owl Fund";
export const TEST_ACCOUNT_DOMAIN = "accounts.owlfund.local";
export const MOVEMENT_THRESHOLD_PP = 4.0;

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
