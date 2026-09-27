import Link from "next/link";
import { DriveNotConnected } from "@/lib/drive/auth";
import { fmtDateTime } from "@/lib/format";
import { renderTab } from "@/lib/pt-sheet/parse";
import { ptSheetConfigured, readPtSheet, type PtSheet } from "@/lib/pt-sheet/read";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Body of /admin/pt-sheet: reads the sheet (from the 5-minute cache unless `fresh`) and shows each tab as Hoot gets it. */
export async function PtSheetView({ fresh }: { fresh: boolean }) {
  let sheet: PtSheet | null = null;
  let error: string | null = null;
  if (!ptSheetConfigured()) error = "Google Drive is not configured in this environment.";
  else {
    try {
      sheet = await readPtSheet({ fresh });
    } catch (e) {
      error = e instanceof DriveNotConnected ? e.message : `Could not read the sheet: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return (
    <>
      <PageHeader
        title="PT sheet read test"
        description="Exactly what Hoot will see from the price target sheet. The app only reads it; nothing here is saved."
        actions={
          <div className="flex gap-2">
            <Button nativeButton={false} render={<Link href="/admin" />} size="sm" variant="ghost">
              Back to Admin
            </Button>
            <Button nativeButton={false} render={<Link href="/admin/pt-sheet?fresh=1" prefetch={false} />} size="sm" variant="outline">
              Read again
            </Button>
          </div>
        }
      />
      {error && <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
      {sheet && (
        <>
          <Card className="mb-6 p-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Sheet</dt>
              <dd>
                <a href={sheet.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {sheet.name}
                </a>
              </dd>
              <dt className="text-muted-foreground">Last edited</dt>
              <dd className="tnum">
                {fmtDateTime(sheet.modifiedTime)}
                {sheet.lastModifiedBy ? ` by ${sheet.lastModifiedBy}` : ""}
              </dd>
              <dt className="text-muted-foreground">Read by the app</dt>
              <dd className="tnum">{fmtDateTime(sheet.fetchedAt)} (reused for up to 5 minutes)</dd>
              <dt className="text-muted-foreground">Tabs</dt>
              <dd>
                {sheet.tabs.filter((t) => t.status === "ok").length} of {sheet.tabs.length + sheet.missingTabs.length} allowed tabs read. Credit Spreads and Sells/Unbought Pitches are not allowed.
                {sheet.missingTabs.length > 0 && <span className="text-destructive"> Missing from the sheet: {sheet.missingTabs.join(", ")}.</span>}
              </dd>
            </dl>
          </Card>
          {sheet.tabs.map((tab) => (
            <section key={tab.name} className="mb-6">
              <SectionTitle
                aside={
                  tab.status === "ok"
                    ? `${tab.rows.length} rows · ${tab.rows.reduce((n, r) => n + r.cells.length, 0)} cells${tab.errorCells ? ` · ${tab.errorCells} error cells` : ""}${tab.truncated ? " · cut short" : ""}`
                    : undefined
                }
              >
                {tab.name} {tab.status === "layout_changed" && <Badge variant="destructive">Layout changed</Badge>}
              </SectionTitle>
              <Card className="p-0">
                <pre className="max-h-96 overflow-auto p-4 text-xs leading-relaxed whitespace-pre">{renderTab(tab)}</pre>
              </Card>
            </section>
          ))}
        </>
      )}
    </>
  );
}
