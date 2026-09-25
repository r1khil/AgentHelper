import { requireOnboardedUser, listAccessibleTeams } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { hootEnabled } from "@/lib/hoot/types";
import { Sidebar } from "@/components/app/sidebar";
import { HootCompanion } from "@/components/app/hoot/hoot-companion";
import { WhatsNewTour } from "@/components/app/tour/whats-new-tour";
import { tourAudience, tourOffer } from "@/lib/tour/offer";
import { WHATS_NEW_TOUR } from "@/lib/tour/whats-new";
import { cn } from "@/lib/utils";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  const teams = await listAccessibleTeams(user);
  const hoot = hootEnabled(user.hoot);
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        user={{ fullName: user.fullName, role: user.role, teamId: user.teamId, email: user.email, username: user.username, transparencyMode: user.transparencyMode, hootEnabled: hoot }}
        teams={teams}
        signOut={signOut}
      />
      <main className="min-w-0 flex-1">
        {/* Room at the bottom so Hoot never sits on the last row of a page. */}
        <div className={cn("app-container mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8", hoot && "pb-24 md:pb-24")}>{children}</div>
      </main>
      {hoot && <HootCompanion firstName={firstName} />}
      {tourAudience(user.role) && <WhatsNewTour firstName={firstName} offer={tourOffer(WHATS_NEW_TOUR, user.role, user.hoot)} hootEnabled={hoot} />}
    </div>
  );
}
