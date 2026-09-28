import { requireOnboardedUser, listAccessibleTeams } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { rememberedScope } from "@/lib/teams";
import { hootEnabled } from "@/lib/hoot/types";
import { AppShell } from "@/components/app/shell/app-shell";
import { WhatsNewTour } from "@/components/app/tour/whats-new-tour";
import { tourAudience, tourOffer } from "@/lib/tour/offer";
import { WHATS_NEW_TOUR } from "@/lib/tour/whats-new";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  const [teams, initialScope] = await Promise.all([listAccessibleTeams(user), rememberedScope(user)]);
  const hoot = hootEnabled(user.hoot);
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  return (
    <>
      <AppShell
        user={{ fullName: user.fullName, role: user.role, teamId: user.teamId, email: user.email, username: user.username, transparencyMode: user.transparencyMode, hootEnabled: hoot }}
        teams={teams}
        signOut={signOut}
        hoot={hoot}
        backtestingLayout={user.hoot?.layouts?.backtesting ?? "new"}
        initialScope={initialScope}
      >
        {children}
      </AppShell>
      {tourAudience(user.role) && <WhatsNewTour firstName={firstName} offer={tourOffer(WHATS_NEW_TOUR, user.role, user.hoot)} hootEnabled={hoot} />}
    </>
  );
}
