import type { securities } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelHeader, Pill } from "@/components/app/panel";
import { ReadAs } from "@/components/app/read-as";
import { deleteBenchmarkWeights } from "@/lib/actions/ledger";
import { GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { fmtAccounting, fmtDate } from "@/lib/format";
import { BenchmarkWeightsForm } from "./benchmark-weights-form";
import { SecurityRowForm } from "./security-row-form";
import { TeamSectorsForm } from "./team-sectors-form";

export const LEDGER_INPUT_TABS = ["benchmark", "securities"] as const;
export type LedgerInputTab = (typeof LEDGER_INPUT_TABS)[number];

type SecurityRow = typeof securities.$inferSelect;
export type WeightSet = { asOf: string; source: string | null; weights: Partial<Record<GicsSector, number>> };

const num = "text-right font-mono text-body";

/** The S&P 500 sector weights the attribution pages measure against: this week's form and every saved set. */
export function BenchmarkInputs({ today, weightSets }: { today: string; weightSets: WeightSet[] }) {
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader title="S&P 500 sector weights" aside="Takes effect the session after the as-of date, then drifts with sector returns" />
        <div className="p-4">
          <BenchmarkWeightsForm today={today} initial={weightSets[0]?.weights ?? {}} />
        </div>
      </Panel>
      {weightSets.length > 0 && (
        <Panel>
          <PanelHeader title="Saved sets" count={weightSets.length} />
          <div className="overflow-x-auto">
            <Table aria-label="Saved S&P 500 sector weight sets">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">As of</TableHead>
                  {GICS_SECTORS.map((s) => (
                    <TableHead key={s} className="text-right font-mono" title={SECTOR_LABELS[s]}>
                      <ReadAs text={SECTOR_LABELS[s]}>{SECTOR_LABELS[s].split(" ").map((w) => w[0]).join("")}</ReadAs>
                    </TableHead>
                  ))}
                  <TableHead>Source</TableHead>
                  <TableHead className="pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weightSets.map((set) => (
                  <TableRow key={set.asOf}>
                    <TableCell className="pl-4 font-mono text-body whitespace-nowrap">{fmtDate(set.asOf)}</TableCell>
                    {GICS_SECTORS.map((s) => (
                      <TableCell key={s} className={num}>
                        {fmtAccounting(set.weights[s] ?? 0, 1)}
                      </TableCell>
                    ))}
                    <TableCell className="max-w-48 truncate text-muted-foreground">{set.source}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <form action={deleteBenchmarkWeights}>
                        <input type="hidden" name="asOf" value={set.asOf} />
                        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                          Remove
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Each security's sector and team, and which sectors define each team's benchmark. */
export function SecuritiesInputs({ securityRows, teams, assigned }: { securityRows: SecurityRow[]; teams: { id: string; name: string }[]; assigned: Partial<Record<GicsSector, string>> }) {
  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <PanelHeader title="Classification" count={securityRows.length} aside="Sector drives fund attribution; team drives the team tabs" />
        {securityRows.length === 0 ? (
          <EmptyState title="No securities yet" className="m-4">
            A security is added the first time it is traded.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table aria-label="Classification">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Ticker</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Sector and team</TableHead>
                  <TableHead className="pr-4">Sector source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {securityRows.map((s) => (
                  <TableRow key={s.ticker}>
                    <TableCell className="pl-4 font-mono font-semibold">{s.ticker}</TableCell>
                    <TableCell className="max-w-64 truncate text-ink-2">{s.name}</TableCell>
                    <TableCell>
                      <SecurityRowForm ticker={s.ticker} sector={s.sector} teamId={s.teamId} teams={teams} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <Pill tone={s.sectorSource === "manual" || s.sectorSource === "yahoo" || s.sectorSource === "default" ? "neutral" : "caution"}>
                        {s.sectorSource === "manual" ? "Set by hand" : s.sectorSource === "yahoo" ? `Yahoo: ${s.yahooSector}` : s.sectorSource === "default" ? "ETF default" : "None"}
                      </Pill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Team sectors" aside="Defines each team's benchmark on its Performance view" />
        <div className="p-4">
          <TeamSectorsForm teams={teams} assigned={assigned} />
        </div>
      </Panel>
    </div>
  );
}
