import { cookies } from "next/headers";
import { requireOnboardedUser, listAccessibleTeams } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { rememberedScope } from "@/lib/teams";
import { hootEnabled } from "@/lib/hoot/types";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { AppShell } from "@/components/app/shell/app-shell";

// The Sep 27 what's-new tour walked through the rail-and-tabs layout this shell replaced, so it is no longer offered.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  const [teams, initialScope, jar] = await Promise.all([listAccessibleTeams(user), rememberedScope(user), cookies()]);
  const hoot = hootEnabled(user.hoot);
  return (
    <AppShell
      user={{ fullName: user.fullName, role: user.role, teamId: user.teamId, email: user.email, username: user.username, transparencyMode: user.transparencyMode, hootEnabled: hoot }}
      teams={teams}
      signOut={signOut}
      hoot={hoot}
      backtestingLayout={user.hoot?.layouts?.backtesting ?? "new"}
      initialScope={initialScope}
      initialCollapsed={jar.get(SIDEBAR_COOKIE)?.value === "collapsed"}
    >
      {children}
    </AppShell>
  );
}
