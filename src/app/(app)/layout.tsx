import { requireUser, listAccessibleTeams } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { Sidebar } from "@/components/app/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const teams = await listAccessibleTeams(user);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        user={{ fullName: user.fullName, role: user.role, teamId: user.teamId, email: user.email, username: user.username }}
        teams={teams}
        signOut={signOut}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
