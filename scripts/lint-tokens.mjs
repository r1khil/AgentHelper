#!/usr/bin/env node
/**
 * Enforces the two rules that keep "restyle by editing one block" true:
 *
 *   1. App code uses semantic tokens only -- no raw Tailwind palette
 *      utilities (bg-slate-50, text-red-500, ...).
 *   2. App code contains no `dark:` variants. Dark mode lives entirely in
 *      the value block in globals.css.
 *
 * src/components/ui is exempt: those files are vendored in shadcn's idiom
 * and must stay regenerable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/app", "src/components/app"];
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW = new RegExp(
  `\\b(?:text|bg|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide)-(?:${PALETTE})-\\d{2,3}\\b`,
);
const DARK = /\bdark:/;

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const problems = [];
for (const root of ROOTS) {
  let files;
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const raw = line.match(RAW);
        if (raw)
          problems.push(
            `${file}:${i + 1}  raw palette utility "${raw[0]}" -- use a semantic token`,
          );
        if (DARK.test(line))
          problems.push(
            `${file}:${i + 1}  "dark:" variant -- dark mode belongs in globals.css values`,
          );
      });
  }
}

if (problems.length) {
  console.error("Token discipline violations:\n");
  for (const p of problems) console.error("  " + p);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("Token discipline OK.");
