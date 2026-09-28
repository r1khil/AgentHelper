import type { Metadata } from "next";
import { after } from "next/server";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { changelogConfigured } from "@/lib/changelog/github";
import { changelogBacklog, loadChangelog, syncChangelog } from "@/lib/changelog";
import { FALLBACK_MODEL } from "@/lib/changelog/summarize";
import { EmptyState } from "@/components/app/empty-state";
import { ChangelogView } from "./changelog-view";

export const metadata: Metadata = { title: "Changelog" };
// Summaries for new pull requests are written after the response (in `after()`), which shares this budget.
export const maxDuration = 120;

export default async function ChangelogPage() {
  const me = await requireRole("exec", "admin");
  const isAdmin = me.role === "admin";

  if (!changelogConfigured()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState title="The changelog is not set up yet">
          {isAdmin ? (
            <>
              Add <code>GITHUB_TOKEN</code> (and optionally <code>GITHUB_REPO</code>) to the environment. See the README section &ldquo;Changelog&rdquo;.
            </>
          ) : (
            "An admin needs to connect the workspace to its code repository."
          )}
        </EmptyState>
      </div>
    );
  }

  // Only the database is awaited here; GitHub and the summary model never hold up the page.
  const entries = await loadChangelog();

  return (
    <ChangelogView
      entries={entries.map((e) => ({
        prNumber: e.prNumber,
        headline: e.headline,
        summary: e.summary,
        author: e.author,
        url: e.url,
        mergedAt: e.mergedAt.toISOString(),
        fallback: e.model === FALLBACK_MODEL,
      }))}
      isAdmin={isAdmin}
      now={new Date().toISOString()}
      status={
        <Suspense fallback="Checking GitHub…">
          <SyncStatus />
        </Suspense>
      }
    />
  );
}

/** Checks GitHub for merged changes without a summary, and writes those summaries once the page has been sent. */
async function SyncStatus() {
  const { missing, retry, error } = await changelogBacklog();
  if (error) return <span title={error}>Could not reach GitHub just now; showing what was already recorded</span>;
  if (missing.length || retry.length) after(() => syncChangelog());
  // Retries of failed summaries already show the title, so only brand-new changes are worth a note.
  if (!missing.length) return <>Up to date with GitHub</>;
  return (
    <>
      {missing.length} more {missing.length === 1 ? "change is" : "changes are"} being summarized; reload in a minute
    </>
  );
}
