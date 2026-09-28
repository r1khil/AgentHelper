import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Every figure and date a reader sees goes through "@/lib/format", so the app writes them one way. This fails when a
 * page or component formats one by hand. The files below format things that are not figures for a reader (input
 * values, SVG and CSS geometry, diagnostics) and say why.
 */
const ROOTS = ["src/app", "src/components"];
const PATTERNS: [RegExp, string][] = [
  [/\.toFixed\(/, ".toFixed("],
  [/\.toLocaleString\(/, ".toLocaleString("],
];

const ALLOWED: Record<string, string> = {
  "src/app/dev/economic-calendar/page.tsx": "dev-only fixture data",
  "src/components/app/backtesting/use-backtesting.ts": "values written into weight inputs, not display",
  "src/components/app/chat/trace-panel.tsx": "token counts, timings and sizes in the admin trace",
  "src/components/app/hoot/hoot-sprite.tsx": "CSS transforms",
  "src/components/app/holdings/sparkline.tsx": "SVG coordinates",
  "src/components/app/movements/format.ts": "session dates, until the date helpers replace them",
  "src/components/app/risk/format.ts": "rsci: daily decimals in the working panels",
  "src/components/app/tour/flying-hoot.tsx": "CSS transforms",
  "src/components/app/tour/placement.ts": "geometry",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe("display formatting goes through @/lib/format", () => {
  it("has no hand-rolled number formatting in pages and components", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of files(root)) {
        const rel = file.split(path.sep).join("/");
        if (rel in ALLOWED) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            for (const [re, what] of PATTERNS) if (re.test(line)) offenders.push(`${rel}:${i + 1} uses ${what}`);
          });
      }
    }
    expect(offenders, "Use fmtPct, fmtBp, fmtUsd, fmtAccounting and the rest from @/lib/format instead").toEqual([]);
  });

  it("allows only files that still exist", () => {
    for (const rel of Object.keys(ALLOWED)) expect(() => statSync(rel), rel).not.toThrow();
  });
});
