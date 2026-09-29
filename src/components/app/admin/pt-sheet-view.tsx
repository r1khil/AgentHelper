import Link from "next/link";
import { DriveNotConnected } from "@/lib/drive/auth";
import { fmtDateTime } from "@/lib/format";
import { displayValue, renderTab, tabColumns, type PtTab } from "@/lib/pt-sheet/parse";
import { ptSheetConfigured, readPtSheet, type PtSheet } from "@/lib/pt-sheet/read";
import { cn } from "@/lib/utils";
import { Panel, PanelFooter, PanelHeader, Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/app/page-head";
import { AdminHead } from "./admin-head";

/** Body of /admin/pt-sheet: reads the sheet (from the 5-minute cache unless `fresh`) and shows each tab as Hoot gets it. */
export async function PtSheetView({ fresh, attention = 0 }: { fresh: boolean; attention?: number }) {
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
  return <PtSheetBody sheet={sheet} error={error} attention={attention} />;
}

/** The presentational part, separate so it can render from plain props. */
export function PtSheetBody({ sheet, error, attention = 0 }: { sheet: PtSheet | null; error: string | null; attention?: number }) {
  const read = sheet ? sheet.tabs.filter((t) => t.status === "ok").length : 0;
  const total = sheet ? sheet.tabs.length + sheet.missingTabs.length : 0;
  return (
    <>
      <AdminHead
        active="pt-sheet"
        attention={attention}
        asof="Execs and admins · read only, nothing here is saved"
        actions={
          <Button nativeButton={false} render={<Link href="/admin/pt-sheet?fresh=1" prefetch={false} />} variant="secondary">
            Read again
          </Button>
        }
      />
      <PageHero
        label="Exactly what Hoot sees from the price target sheet"
        value={sheet ? `${read} of ${total} tabs read` : "Not read"}
        note={
          <span className={error || (sheet && read < total) ? "font-semibold text-caution-foreground" : undefined}>
            {error ?? (sheet ? (read < total ? "Some allowed tabs could not be read; they are listed below" : "Every allowed tab was read. The app only reads the sheet, and never edits it") : "")}
          </span>
        }
      />
      {sheet && (
        <div className="mt-6 flex flex-col gap-6">
          <Panel variant="plain" className="shrink-0">
            <PanelHeader title="Sheet" aside={`${read} of ${total} allowed tabs read`} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 border-t text-body">
              {[
                [
                  "Sheet",
                  <a key="s" href={sheet.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {sheet.name}
                  </a>,
                ],
                [
                  "Last edited",
                  <span key="e">
                    {fmtDateTime(sheet.modifiedTime)}
                    {sheet.lastModifiedBy ? ` by ${sheet.lastModifiedBy}` : null}
                  </span>,
                ],
                ["Read by the app", <span key="r">{fmtDateTime(sheet.fetchedAt)} (reused for up to 5 minutes)</span>],
                [
                  "Tabs",
                  <span key="t">
                    {read} of {total} allowed tabs read. Credit Spreads and Sells/Unbought Pitches are not allowed.
                    {sheet.missingTabs.length > 0 && <span className="text-caution-foreground"> Missing from the sheet: {sheet.missingTabs.join(", ")}.</span>}
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
            <TabPanel key={tab.name} tab={tab} />
          ))}
        </div>
      )}
    </>
  );
}

/** One allowed tab as a table: the sheet's row numbers down the side, its own header labels across the top. */
function TabPanel({ tab }: { tab: PtTab }) {
  const columns = tabColumns(tab);
  return (
    <Panel variant="plain" className="shrink-0">
      <PanelHeader
        title={tab.name}
        aside={
          tab.status === "ok" ? (
            <span>
              {tab.rows.length} rows · {tab.rows.reduce((n, r) => n + r.cells.length, 0)} cells{tab.errorCells ? ` · ${tab.errorCells} ${tab.errorCells === 1 ? "cell" : "cells"} with errors` : ""}
              {tab.truncated ? " · cut short" : ""}
            </span>
          ) : undefined
        }
      >
        {tab.status === "layout_changed" && <Pill tone="caution">Layout changed</Pill>}
      </PanelHeader>
      <p className="border-t border-row py-2 text-body text-muted-foreground">{tab.about}</p>
      {tab.status === "layout_changed" ? (
        <p className="py-3 text-body text-caution-foreground">Not read: the tab&rsquo;s layout changed (missing column labels: {tab.missingLabels.join(", ")}).</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-max min-w-full border-collapse text-body">
            <thead className="sticky top-0 z-10 bg-band text-left text-body text-muted-foreground">
              <tr>
                <th scope="col" className="sticky left-0 z-20 border-b bg-band px-3 py-1.5 text-right font-medium">Row</th>
                {columns.map((c) => (
                  <th scope="col" key={c.col} className="border-b px-3 py-1.5 font-medium whitespace-nowrap">
                    {c.label && <span className="text-foreground">{c.label} </span>}
                    <span className="font-mono text-caption">{c.col}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab.rows.map((r) => {
                const byCol = new Map(r.cells.map((c) => [c.col, c]));
                return (
                  <tr key={r.row} className="border-b border-row last:border-b-0 hover:bg-band">
                    <td className="sticky left-0 bg-card px-3 py-1.5 text-right font-mono text-body text-muted-foreground tnum">{r.row}</td>
                    {columns.map(({ col }) => {
                      const cell = byCol.get(col);
                      const text = cell ? displayValue(cell) : "";
                      return (
                        <td
                          key={col}
                          title={cell ? `${cell.ref}: ${text}` : undefined}
                          className={cn("max-w-[280px] truncate px-3 py-1.5 whitespace-nowrap", typeof cell?.v === "number" && "text-right tnum", cell?.error && "font-semibold text-caution-foreground")}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab.truncated && <PanelFooter className="text-caution-foreground">Tab cut short: too many cells. Hoot gets the same rows shown here.</PanelFooter>}
      <details className="border-t bg-band-2">
        <summary className="cursor-pointer px-4 py-2 text-body text-muted-foreground select-none hover:text-foreground">The same tab as the text Hoot is given</summary>
        <pre className="max-h-96 overflow-auto px-0 pb-4 font-mono text-body leading-relaxed whitespace-pre">{renderTab(tab)}</pre>
      </details>
    </Panel>
  );
}
