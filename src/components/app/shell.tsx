import Link from "next/link";
import { signOut } from "@/app/actions";
import { db } from "@/db/client";
import type { Actor } from "@/lib/access";
import { SubmitButton } from "./submit-button";
import { NavLink } from "./nav-link";
import {
  AdminIcon,
  BriefingIcon,
  JoinIcon,
  OverviewIcon,
  SignOutIcon,
  TeamIcon,
  WorkIcon,
} from "./icons";

export async function AppShell({
  actor,
  children,
}: {
  actor: Actor;
  children: React.ReactNode;
}) {
  // Teams belong in navigation: the product is organised around team
  // workspaces, and previously the only route to one was a card on the
  // overview page.
  const teams = await db()`
    select t.id, t.name
    from team t
    where (${actor.admin} or exists(
      select 1 from membership m where m.team_id = t.id and m.user_id = ${actor.id}
    ))
    order by t.name`;

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen w-56 shrink-0 flex-col overflow-y-auto px-4 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
          <span className="text-sidebar-accent font-serif text-2xl italic leading-none">
            ah
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">AgentHelper</span>
            <span className="text-sidebar-muted block text-[9px] tracking-[0.16em]">
              OWLFUND RESEARCH
            </span>
          </span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          <NavLink href="/" exact>
            <OverviewIcon />
            <span>Overview</span>
          </NavLink>
          <NavLink href="/work">
            <WorkIcon />
            <span>My work</span>
          </NavLink>
          <NavLink href="/briefings">
            <BriefingIcon />
            <span>Briefings</span>
          </NavLink>
        </nav>

        {teams.length > 0 && (
          <>
            <div className="text-sidebar-muted mt-5 mb-1.5 px-2.5 text-[9px] font-semibold tracking-[0.16em]">
              TEAMS
            </div>
            <nav className="flex flex-col gap-0.5">
              {teams.map((t) => (
                <NavLink key={t.id} href={`/teams/${t.id}`}>
                  <TeamIcon />
                  <span className="truncate">{t.name}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div className="text-sidebar-muted mt-5 mb-1.5 px-2.5 text-[9px] font-semibold tracking-[0.16em]">
          ACCOUNT
        </div>
        <nav className="flex flex-col gap-0.5">
          <NavLink href="/join">
            <JoinIcon />
            <span>Join a team</span>
          </NavLink>
          {actor.admin && (
            <NavLink href="/admin">
              <AdminIcon />
              <span>Administration</span>
            </NavLink>
          )}
        </nav>

        <div className="mt-auto pt-6">
          <div className="border-sidebar-border flex items-center gap-2.5 border-t pt-3">
            <span className="border-sidebar-border grid size-7 shrink-0 place-items-center rounded-full border font-serif text-xs">
              {actor.name[0]}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-semibold">
                {actor.name}
              </span>
              <span className="text-sidebar-muted block text-[10px]">
                {actor.admin ? "Fund administrator" : "Team analyst"}
              </span>
            </span>
          </div>
          <form action={signOut}>
            <SubmitButton
              className="text-sidebar-muted hover:text-sidebar-foreground mt-2 flex items-center gap-2 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-[11px] font-normal transition-colors"
              pendingLabel="Signing out…"
            >
              <SignOutIcon />
              <span>Sign out</span>
            </SubmitButton>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border text-muted-foreground flex h-11 items-center justify-between gap-4 border-b px-6 text-[10px] tracking-[0.14em]">
          <span className="uppercase">Research / Evidence workspace</span>
          <span className="border-notice-border bg-notice-surface text-notice flex items-center gap-1.5 rounded-full border px-2.5 py-1">
            <span className="bg-notice size-1.5 rounded-full" />
            Synthetic pilot
          </span>
        </header>

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-7">
          {children}
        </main>

        <footer className="border-border text-muted-foreground border-t px-6 py-4 text-center text-[11px]">
          The agent prepares the evidence. The analyst owns the interpretation.
        </footer>
      </div>
    </div>
  );
}
