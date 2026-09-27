import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { DriveNotConnected } from "@/lib/drive/auth";
import { fmtDateTime } from "@/lib/format";
import { renderTab } from "@/lib/pt-sheet/parse";
import { ptSheetConfigured, readPtSheet, type PtSheet } from "@/lib/pt-sheet/read";
import { Panel, PanelHeader, Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";

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
  return <PtSheetBody sheet={sheet} error={error} />;
}

/** The presentational part, separate so it can render from plain props. */
export function PtSheetBody({ sheet, error }: { sheet: PtSheet | null; error: string | null }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[19px] font-semibold tracking-[-0.015em]">PT sheet read test</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Exactly what Hoot will see from the price target sheet. The app only reads it; nothing here is saved.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/admin" />} size="lg" variant="outline">
          <ArrowLeft data-icon="inline-start" />
          Back to Admin
        </Button>
        <Button nativeButton={false} render={<Link href="/admin/pt-sheet?fresh=1" prefetch={false} />} size="lg">
          <RefreshCw data-icon="inline-start" />
          Read again
        </Button>
      </div>
      {error && <div className="rounded-[10px] bg-caution px-3.5 py-2 text-[13px] text-caution-foreground">{error}</div>}
      {sheet && (
        <>
          <Panel className="shrink-0">
            <PanelHeader title="Sheet" aside={`${sheet.tabs.filter((t) => t.status === "ok").length} of ${sheet.tabs.length + sheet.missingTabs.length} allowed tabs read`} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 px-4 text-[13.5px]">
              {[
                [
                  "Sheet",
                  <a key="s" href={sheet.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {sheet.name}
                  </a>,
                ],
                [
                  "Last edited",
                  <span key="e" className="font-mono text-[12.5px]">
                    {fmtDateTime(sheet.modifiedTime)}
                    {sheet.lastModifiedBy ? <span className="font-sans text-[13.5px]"> by {sheet.lastModifiedBy}</span> : null}
                  </span>,
                ],
                [
                  "Read by the app",
                  <span key="r">
                    <span className="font-mono text-[12.5px]">{fmtDateTime(sheet.fetchedAt)}</span> (reused for up to 5 minutes)
                  </span>,
                ],
                [
                  "Tabs",
                  <span key="t">
                    {sheet.tabs.filter((t) => t.status === "ok").length} of {sheet.tabs.length + sheet.missingTabs.length} allowed tabs read. Credit Spreads and Sells/Unbought Pitches are not allowed.
                    {sheet.missingTabs.length > 0 && <span className="text-down"> Missing from the sheet: {sheet.missingTabs.join(", ")}.</span>}
                  </span>,
                ],
              ].map(([k, v]) => (
                <div key={String(k)} className="col-span-2 grid grid-cols-subgrid border-b border-row py-2.5 last:border-b-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {sheet.tabs.map((tab) => (
            <Panel key={tab.name} className="shrink-0">
              <PanelHeader
                title={tab.name}
                aside={
                  tab.status === "ok" ? (
                    <span className="font-mono text-xs">
                      {tab.rows.length} rows · {tab.rows.reduce((n, r) => n + r.cells.length, 0)} cells{tab.errorCells ? ` · ${tab.errorCells} error cells` : ""}
                      {tab.truncated ? " · cut short" : ""}
                    </span>
                  ) : undefined
                }
              >
                {tab.status === "layout_changed" && <Pill tone="caution">Layout changed</Pill>}
              </PanelHeader>
              <pre className="max-h-96 overflow-auto bg-band-2 p-4 font-mono text-xs leading-relaxed whitespace-pre">{renderTab(tab)}</pre>
            </Panel>
          ))}
        </>
      )}
    </div>
  );
}
