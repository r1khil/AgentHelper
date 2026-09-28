"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, Search, Sparkles } from "lucide-react";
import { fmtNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CellInfo, WorkbookInfo } from "@/lib/excel/read";
import { parsePeriodLabel } from "@/lib/models/periods";
import { defaultSheetIndex, splitSheetTabs } from "@/lib/models/sheet-tabs";
import { periodEndsFor, saveMapping, searchConcepts, suggestFromValue } from "@/lib/actions/models";
import type { ConceptSuggestion } from "@/lib/models/proposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/app/native-select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CountChip } from "@/components/app/panel";
import { Tabs } from "@/components/app/tabs";

type Props = { modelId: string; workbook: WorkbookInfo; existing: { sheet: string; rowRef: number }[] };
type ConceptHit = { concept: string; label: string; units: string[]; count: number };

const MAX_ROWS = 80;
const MAX_COLS = 20;
const SCALES = [
  { v: 1, label: "as reported (units)" },
  { v: 1000, label: "thousands" },
  { v: 1000000, label: "millions" },
  { v: 1000000000, label: "billions" },
];

export function MappingEditor({ modelId, workbook, existing }: Props) {
  const router = useRouter();
  const sheetNames = useMemo(() => workbook.sheets.map((s) => s.name), [workbook]);
  const mappedPerSheet = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of existing) n.set(e.sheet, (n.get(e.sheet) ?? 0) + 1);
    return n;
  }, [existing]);
  const mappedCount = (name: string) => mappedPerSheet.get(name) ?? 0;
  // Opens on the sheet that matters most (mapped rows, else the model's main sheet), not the cover.
  const [sheetIdx, setSheetIdx] = useState(() => defaultSheetIndex(sheetNames, mappedCount));
  const [row, setRow] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [periods, setPeriods] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<string>("");
  const [concept, setConcept] = useState<ConceptHit | null>(null);
  const [unit, setUnit] = useState("USD");
  const [scale, setScale] = useState(1000000);
  const [sign, setSign] = useState(1);
  const [periodType, setPeriodType] = useState<"quarterly" | "annual">("quarterly");
  const [rationale, setRationale] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ConceptHit[]>([]);
  const [suggestions, setSuggestions] = useState<ConceptSuggestion[] | null>(null);
  const [reportedEnds, setReportedEnds] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);

  const sheet = workbook.sheets[sheetIdx];
  // A handful of sheets as tabs, the rest in "More sheets"; the chosen one always has a tab.
  const sheetTabs = splitSheetTabs(sheetNames, mappedCount, sheetIdx);
  const pickSheet = (i: number) => {
    setSheetIdx(i);
    setRow(null);
  };
  const cols = useMemo(() => {
    const n = Math.min(sheet?.colCount ?? 0, MAX_COLS);
    return Array.from({ length: n }, (_, i) => colLetter(i + 1));
  }, [sheet]);
  const grid = useMemo(() => {
    const map = new Map<string, CellInfo>();
    for (const r of sheet?.rows ?? []) for (const c of r.cells) map.set(c.ref, c);
    return map;
  }, [sheet]);
  const rowNumbers = useMemo(() => (sheet?.rows ?? []).map((r) => r.r).filter((r) => r <= MAX_ROWS), [sheet]);
  const mappedRows = useMemo(() => new Set(existing.filter((e) => e.sheet === sheet?.name).map((e) => e.rowRef)), [existing, sheet]);

  const rowCells = row ? (sheet?.rows.find((r) => r.r === row)?.cells ?? []) : [];
  const formulaCols = rowCells.filter((c) => c.isFormula).map((c) => c.col);
  // Candidate columns: typed numbers in the row, plus empty cells sitting under a period header. Never formula cells.
  const numericCols = useMemo(() => {
    if (!row) return [] as string[];
    const set = new Set<string>();
    for (const c of rowCells) if (typeof c.v === "number" && !c.isFormula) set.add(c.col);
    for (const c of cols) {
      if (formulaCols.includes(c) || set.has(c)) continue;
      const cell = grid.get(`${c}${row}`);
      if (cell && cell.v !== null && cell.v !== "") continue; // text in the way
      if (headerFor(c, row)) set.add(c);
    }
    return cols.filter((c) => set.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, sheet]);

  function headerFor(col: string, r: number) {
    for (let rr = r - 1; rr >= 1 && rr >= r - 12; rr--) {
      const h = grid.get(`${col}${rr}`);
      const parsed = h ? parsePeriodLabel(h.v) : null;
      if (parsed) return parsed;
    }
    return null;
  }

  function selectRow(r: number) {
    setRow(r);
    const cells = sheet?.rows.find((x) => x.r === r)?.cells ?? [];
    const text = cells.find((c) => typeof c.v === "string" && c.v.trim());
    setLabel(text ? String(text.v) : `Row ${r}`);
    // Guess period ends from header cells above every candidate column.
    const guess: Record<string, string> = {};
    const formula = new Set(cells.filter((c) => c.isFormula).map((c) => c.col));
    for (const c of cols) {
      if (formula.has(c)) continue;
      const cell = grid.get(`${c}${r}`);
      if (cell && typeof cell.v === "string" && cell.v !== "") continue;
      const h = headerFor(c, r);
      if (h) guess[c] = h;
    }
    setPeriods(guess);
    setAnchor("");
    setSuggestions(null);
  }

  function runSearch() {
    if (!query.trim()) return;
    start(async () => {
      try {
        setHits(await searchConcepts(modelId, query));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      }
    });
  }

  function chooseConcept(c: ConceptHit) {
    setConcept(c);
    setUnit(c.units.includes("USD") ? "USD" : c.units[0]);
    start(async () => {
      try {
        setReportedEnds(await periodEndsFor(modelId, c.concept, c.units.includes("USD") ? "USD" : c.units[0], periodType));
      } catch {
        setReportedEnds([]);
      }
    });
  }

  function suggest() {
    if (!anchor || !periods[anchor]) {
      toast.error("Pick the column you typed by hand and give it a period end first");
      return;
    }
    const v = grid.get(`${anchor}${row}`)?.v;
    if (typeof v !== "number") return;
    start(async () => {
      try {
        setSuggestions(await suggestFromValue(modelId, periods[anchor], v));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Suggestion failed");
      }
    });
  }

  async function save() {
    if (!row || !sheet || !concept) return;
    setSaving(true);
    const periodColumns = Object.fromEntries(Object.entries(periods).filter(([c, d]) => numericCols.includes(c) && d));
    const res = await saveMapping({ modelId, sheet: sheet.name, rowRef: row, labelInModel: label, concept: concept.concept, taxonomy: "us-gaap", unit, scale, sign, periodType, anchorColumn: anchor || undefined, rationale, periodColumns });
    setSaving(false);
    if (res.ok) {
      toast.success("Mapping saved. Generate proposals when you have mapped the line items you need.");
      setRow(null);
      setConcept(null);
      setRationale("");
      setSuggestions(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (!sheet) return <div className="panel p-4 text-body text-muted-foreground">This workbook has no readable sheets.</div>;

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 border-b bg-band px-3">
        <Tabs
          label="Sheets"
          rule={false}
          className="min-w-0"
          onSelect={(k) => pickSheet(Number(k))}
          items={sheetTabs.tabs.map((i) => {
            const mapped = mappedCount(sheetNames[i]);
            return { key: String(i), label: sheetNames[i], active: i === sheetIdx, count: mapped || undefined, title: mapped ? `${mapped} line item${mapped === 1 ? "" : "s"} mapped` : undefined };
          })}
        />
        {sheetTabs.more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm text-body whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-popup-open:text-foreground">
              More sheets
              <CountChip>{sheetTabs.more.length}</CountChip>
              <ChevronDown className="size-3.5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {sheetTabs.more.map((i) => {
                const mapped = mappedCount(sheetNames[i]);
                return (
                  <DropdownMenuItem key={i} onClick={() => pickSheet(i)}>
                    <span className="min-w-0 flex-1 truncate">{sheetNames[i]}</span>
                    {mapped > 0 && <span className="text-caption text-muted-foreground">{mapped} mapped</span>}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <span className="ml-auto py-2 text-body text-muted-foreground">Click a row to map it. Shaded cells hold formulas and are never written.</span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="max-h-[520px] overflow-auto border-b lg:border-r lg:border-b-0">
          <table className="w-max min-w-full border-collapse font-mono text-caption">
            <thead className="sticky top-0 z-10 bg-band">
              <tr>
                <th scope="col" className="w-8 border-r border-b px-1 py-1 text-right text-muted-foreground">#</th>
                {cols.map((c) => (
                  <th scope="col" key={c} className="min-w-16 border-r border-b px-1.5 py-1 text-left font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowNumbers.map((r) => (
                <tr key={r} onClick={() => selectRow(r)} className={cn("cursor-pointer hover:bg-muted/60", row === r && "bg-primary/10", mappedRows.has(r) && "bg-up/10")}>
                  <td className="tnum sticky left-0 border-r border-b bg-muted px-1 py-0.5 text-right text-muted-foreground">{r}</td>
                  {cols.map((c) => {
                    const cell = grid.get(`${c}${r}`);
                    return (
                      <td key={c} className={cn("tnum max-w-40 truncate border-r border-b px-1.5 py-0.5", cell?.isFormula && "bg-muted/70 text-muted-foreground", typeof cell?.v === "number" && "text-right")} title={cell?.f ? `=${cell.f}` : undefined}>
                        {cell ? (typeof cell.v === "number" ? fmtNumber(cell.v) : String(cell.v ?? "")) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4 p-4 text-body">
          {row === null ? (
            <p className="text-muted-foreground">Select the row of a line item you want Hoot to fill (for example Revenue). You enter its first period by hand; Hoot checks the other periods against that number.</p>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label>Line item in the model</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
                <p className="text-body text-muted-foreground">{sheet.name}!row {row} · {numericCols.length} mappable column{numericCols.length === 1 ? "" : "s"}{formulaCols.length ? ` · ${formulaCols.length} formula column${formulaCols.length === 1 ? "" : "s"} skipped` : ""}</p>
              </div>

              <div className="grid gap-1.5">
                <Label>Period end per column</Label>
                {numericCols.length === 0 ? (
                  <p className="text-body text-warning-foreground">No mappable columns: this row has no typed numbers and no period headers above it. Pick a row with input cells, or add a header row with period labels.</p>
                ) : (
                  <div className="grid gap-1">
                    {numericCols.map((c) => (
                      <div key={c} className="flex items-center gap-2">
                        <input type="radio" name="anchor" checked={anchor === c} onChange={() => setAnchor(c)} disabled={typeof grid.get(`${c}${row}`)?.v !== "number"} title="The period you entered by hand" />
                        <span className="tnum w-7 text-body font-medium">{c}</span>
                        <span className="tnum w-24 truncate text-right text-caption text-muted-foreground">{typeof grid.get(`${c}${row}`)?.v === "number" ? fmtNumber(grid.get(`${c}${row}`)!.v as number, 2) : "empty"}</span>
                        <Input type="date" value={periods[c] ?? ""} onChange={(e) => setPeriods({ ...periods, [c]: e.target.value })} className="h-7 w-40 text-body" list={`ends-${c}`} />
                        <datalist id={`ends-${c}`}>
                          {reportedEnds.map((d) => (
                            <option key={d} value={d} />
                          ))}
                        </datalist>
                      </div>
                    ))}
                    <p className="text-body text-muted-foreground">Pick the column holding the number you typed by hand. Dates were guessed from headers; fix any that are wrong. Leave a date empty to skip a column.</p>
                  </div>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label title="The XBRL tag the company uses in its SEC filings">Reported figure (from SEC filings)</Label>
                <div className="flex gap-2">
                  <Input placeholder="Search: revenue, operating income, diluted eps…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch())} className="h-8" />
                  <Button type="button" size="sm" variant="outline" onClick={runSearch} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : <Search />}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={pending || !anchor} title="Find reported figures that match the number you typed for that period">
                    <Sparkles />
                    Match my number
                  </Button>
                </div>
                {suggestions && (
                  <div className="rounded-lg border p-2">
                    <div className="mb-1 text-body font-medium">Facts matching {fmtNumber(grid.get(`${anchor}${row}`)?.v as number)} for {periods[anchor]}:</div>
                    {suggestions.length === 0 ? (
                      <p className="text-body text-muted-foreground">No reported fact matches at ×1, ×1k, ×1M, or ×1B. Check the period end or the number.</p>
                    ) : (
                      <ul className="space-y-1">
                        {suggestions.map((s) => (
                          <li key={`${s.concept}-${s.unit}-${s.scale}`}>
                            <button type="button" className="w-full rounded px-1.5 py-1 text-left text-body hover:bg-muted" onClick={() => { chooseConcept({ concept: s.concept, label: s.label, units: [s.unit], count: 0 }); setUnit(s.unit); setScale(s.scale); setPeriodType(s.periodKind === "annual" ? "annual" : "quarterly"); }}>
                              <span className="font-medium">{s.label}</span> <code className="text-muted-foreground">{s.concept}</code> · {s.unit} · model in {SCALES.find((x) => x.v === s.scale)?.label ?? s.scale} · {s.periodKind}{s.exact ? " · exact" : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {hits.length > 0 && !concept && (
                  <ul className="max-h-40 space-y-0.5 overflow-auto rounded-lg border p-1">
                    {hits.map((h) => (
                      <li key={h.concept}>
                        <button type="button" className="w-full rounded px-1.5 py-1 text-left text-body hover:bg-muted" onClick={() => chooseConcept(h)}>
                          <span className="font-medium">{h.label}</span> <code className="text-muted-foreground">{h.concept}</code> · {h.units.join("/")} · {h.count} facts
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {concept && (
                  <div className="flex items-center justify-between rounded-lg border bg-band px-2 py-1.5 text-body">
                    <span><span className="font-medium">{concept.label}</span> <code className="text-muted-foreground">{concept.concept}</code></span>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={() => setConcept(null)}>change</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Unit</Label>
                  <NativeSelect value={unit} onChange={(e) => setUnit(e.target.value)}>
                    {(concept?.units.length ? concept.units : ["USD", "USD/shares", "shares", "pure"]).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Model shows</Label>
                  <NativeSelect value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                    {SCALES.map((s) => (
                      <option key={s.v} value={s.v}>{s.label}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Period type</Label>
                  <NativeSelect value={periodType} onChange={(e) => setPeriodType(e.target.value as "quarterly" | "annual")}>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label>Sign</Label>
                  <NativeSelect value={sign} onChange={(e) => setSign(Number(e.target.value))}>
                    <option value={1}>As reported</option>
                    <option value={-1}>Flip (model shows costs negative)</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Why this concept maps to this line (your reasoning, kept with the mapping)</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="e.g. Model revenue is total net revenue; company reports it as RevenueFromContractWithCustomerExcludingAssessedTax in $ millions." />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setRow(null)}>Cancel</Button>
                <Button type="button" size="sm" onClick={save} disabled={saving || !concept || !label.trim() || rationale.trim().length < 10 || !Object.values(periods).some(Boolean)}>
                  {saving ? "Saving…" : "Save mapping"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function colLetter(n: number) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
