import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { changelogConfigured } from "@/lib/changelog/github";
import { loadChangelog, syncChangelog } from "@/lib/changelog";
import { FALLBACK_MODEL } from "@/lib/changelog/summarize";
import { mergeDayLabel } from "@/lib/changelog/clean";
import { refreshChangelog, regenerateEntry } from "@/lib/actions/changelog";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ChangelogEntry } from "@/db/schema";

export const metadata: Metadata = { title: "Changelog" };
// Summaries for new pull requests are written during the request; give it room.
export const maxDuration = 120;

export default async function ChangelogPage() {
  const me = await requireRole("exec", "admin");
  const isAdmin = me.role === "admin";

  if (!changelogConfigured()) {
    return (
      <>
        <PageHeader title="Changelog" description="What changed in the workspace, in plain English." />
        <EmptyState title="The changelog is not set up yet">
          {isAdmin ? (
            <>
              Add <code>GITHUB_TOKEN</code> (and optionally <code>GITHUB_REPO</code>) to the environment. See the README section &ldquo;Changelog&rdquo;.
            </>
          ) : (
            "An admin needs to connect the workspace to its code repository."
          )}
        </EmptyState>
      </>
    );
  }

  const sync = await syncChangelog();
  const entries = await loadChangelog();

  const days: { label: string; items: ChangelogEntry[] }[] = [];
  for (const e of entries) {
    const label = mergeDayLabel(e.mergedAt);
    const last = days.at(-1);
    if (last && last.label === label) last.items.push(e);
    else days.push({ label, items: [e] });
  }

  return (
    <>
      <PageHeader
        title="Changelog"
        description="What changed in the workspace, in plain English. Each entry is one change released to everyone."
        actions={
          <form action={refreshChangelog}>
            <Button type="submit" variant="outline" size="sm">
              <RefreshCw data-icon="inline-start" />
              Refresh
            </Button>
          </form>
        }
      />

      {sync.error && <p className="mb-4 text-sm text-muted-foreground">Could not reach GitHub just now ({sync.error}). Showing what was already recorded.</p>}
      {sync.pending > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          {sync.pending} more {sync.pending === 1 ? "change is" : "changes are"} still being summarized. Reload or press Refresh in a moment.
        </p>
      )}

      {entries.length === 0 && !sync.error && <EmptyState title="No changes recorded yet" hoot="sleepy">Merged changes will appear here automatically.</EmptyState>}

      {days.map((day) => (
        <section key={day.label} className="mb-8">
          <SectionTitle>{day.label}</SectionTitle>
          <div className="space-y-3">
            {day.items.map((e) => (
              <Card key={e.prNumber} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-medium">{e.headline}</h3>
                  {isAdmin && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <a href={e.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                        PR #{e.prNumber}
                      </a>
                      <form action={regenerateEntry}>
                        <input type="hidden" name="prNumber" value={e.prNumber} />
                        <Button type="submit" variant="ghost" size="xs">
                          Regenerate
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{e.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Merged by {e.author}
                  {e.model === FALLBACK_MODEL && isAdmin ? " · summary not generated (model unavailable)" : ""}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
