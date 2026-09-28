#!/usr/bin/env node
// Type-scale codemod: rewrites every font-size class in src/ onto the six steps defined in src/app/globals.css.
//
//   node scripts/codemods/type-scale.mjs            rewrite src/ in place and print a summary
//   node scripts/codemods/type-scale.mjs --dry      print what would change, write nothing
//   node scripts/codemods/type-scale.mjs --check    write nothing; exit 1 if any off-scale size (or a raw `cn` import) is left
//   node scripts/codemods/type-scale.mjs --verbose  also list every file and line it touches
//   node scripts/codemods/type-scale.mjs <paths…>   limit to these files or folders (default: src)
//
// A file whose text contains `type-scale: ignore-file` is skipped (the codemod's own test fixtures).
//
// Deterministic and idempotent: the output only contains scale classes, which the patterns below never match, so a
// second run changes nothing. It works on raw text, so it covers className strings, cn()/cva() arguments, template
// literals, object keys and CSS @apply alike, and leaves any variant prefix (md:, hover:, [&_h1]:, group-…/x:) and
// any trailing modifier (/6, !) in place.
//
// The scale (px / line-height / role):
//   text-caption  11 / 16  chips, badges, counts, uppercase labels, avatar initials, tiny meta
//   text-body     13 / 20  everything you read: table cells, rows, secondary lines, footers, help, buttons
//   text-emph     15 / 22  panel titles, card headings, large reading text (chat answers), a ticker's company line
//   text-title    20 / 28  page titles (header h1), section and dialog titles
//   text-display  26 / 32  big figures in stat strips, the ticker/greeting h1
//   text-hero     44 / 44  the one hero number (Today's Last session)
//
// Mapping from what the code used before (see mapPx / NAMED):
//   ≤ 11.5px (10, 10.5, 11, 11.5)           → caption
//   12px and text-xs                         → caption in a chip/label or a stacked secondary line, else body (see COMPACT)
//   12.5 – 14px (12.5, 12.8, 13, 13.5, 14)   → body       text-sm (14) → body
//   14.5 – 16px (14.5, 15)                   → emph       text-base (16) → emph
//   17 – 22px (17, 19)                       → title      text-lg (18), text-xl (20) → title
//   23 – 34px (26, 28)                       → display    text-2xl (24), text-3xl (30) → display
//   ≥ 35px (44)                              → hero       text-4xl and up → hero
//
// It also points `import { cn } from "cn"` at "@/lib/utils", whose cn knows the scale names: the stock cn treats an
// unknown `text-body` as a color and drops it next to `text-muted-foreground`.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCALE = {
  caption: { px: 11, leading: 16 },
  body: { px: 13, leading: 20 },
  emph: { px: 15, leading: 22 },
  title: { px: 20, leading: 28 },
  display: { px: 26, leading: 32 },
  hero: { px: 44, leading: 44 },
};
export const SCALE_NAMES = Object.keys(SCALE);

/** Tailwind's named sizes, in px. */
export const NAMED = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };

/**
 * A 12px size (text-xs, text-[12px]) sits between caption and body, and the code used it for both roles. It goes to
 * caption when the class string it lives in is
 *   - a compact element (COMPACT): a pill/chip/badge (rounded-full), an uppercase or tracked label, a fixed ≤24px-tall
 *     control, or a sized circle (avatar initials); or
 *   - a secondary line stacked under or beside the main one (SUBLINE): it has a top margin, is a block, or truncates
 *     or clamps (the "who · when" line under a title, a stat's note, a date column);
 * and nothing in it is 28px or taller (TALL: a rounded-full h-7 button or an h-9 header row is a control, not a chip).
 * Everything else (help paragraphs, table cells, column headers, legends, tooltips) goes to body.
 */
export const COMPACT = /(?:^|[\s"'`:])(?:rounded-full|uppercase|label-mono|tracking-[\w.[\]-]+|h-(?:4|4\.5|5|5\.5|6)|h-\[(?:1[4-9]|2[0-4])px\]|size-[\w.[\]-]+)(?=$|[\s"'`])/;
export const SUBLINE = /(?:^|[\s"'`])(?:mt-[\w.[\]-]+|block|truncate|line-clamp-\d+)(?=$|[\s"'`])/;
export const TALL = /(?:^|[\s"'`:])(?:min-)?h-(?:7|8|9|\d{2,}|\[(?:2[89]|[3-9]\d|\d{3,})px\])(?=$|[\s"'`])/;

/** Maps a px value to a scale step; `context` (the surrounding class string) is only used for 12px. */
export function mapPx(px, context = "") {
  if (px < 12) return "caption";
  if (px === 12) return (COMPACT.test(context) || SUBLINE.test(context)) && !TALL.test(context) ? "caption" : "body";
  if (px < 14.5) return "body";
  if (px <= 16) return "emph";
  if (px <= 22) return "title";
  if (px < 35) return "display";
  return "hero";
}

// A font-size class: text-[Npx] or a named size. The lookbehind stops at whatever can precede a class (start, space,
// a quote, a variant's colon, `!`, a brace or paren); the lookahead allows a /line-height modifier or trailing `!`.
const BEFORE = String.raw`(?<=^|[\s"'\x60{}(),:!])`;
const AFTER = String.raw`(?=$|[\s"'\x60{}(),;!/])`;
const NAMED_ALT = Object.keys(NAMED).sort((a, b) => b.length - a.length).join("|");
export const SIZE_RE = new RegExp(`${BEFORE}text-(?:\\[(\\d+(?:\\.\\d+)?)px\\]|(${NAMED_ALT}))${AFTER}`, "g");
/** Sizes the codemod can't map (other units, arbitrary lengths, CSS variables). --check fails on these. */
export const UNMAPPED_RE = new RegExp(`${BEFORE}text-(?:\\[(?:length:)?[\\d.]+(?:rem|em|pt|vw|vh|%)\\]|\\[length:[^\\]]+\\]|\\(length:[^)]+\\))${AFTER}`, "g");
const CN_IMPORT_RE = /import\s*\{\s*cn\s*\}\s*from\s*(["'])cn\1/g;

/** The class string around `index`: from the previous quote/backtick to the next one, on the same line. */
function contextAt(text, index, length) {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  let lineEnd = text.indexOf("\n", index);
  if (lineEnd === -1) lineEnd = text.length;
  const before = text.slice(lineStart, index);
  const after = text.slice(index + length, lineEnd);
  const open = Math.max(before.lastIndexOf('"'), before.lastIndexOf("'"), before.lastIndexOf("`"));
  const closeCandidates = ['"', "'", "`"].map((q) => after.indexOf(q)).filter((i) => i >= 0);
  const close = closeCandidates.length ? Math.min(...closeCandidates) : after.length;
  return before.slice(open + 1) + text.slice(index, index + length) + after.slice(0, close);
}

/**
 * Rewrites one file's text. Returns the new text and a list of changes ({ from, to, line }).
 * `file` is used only to skip the cn import rewrite in src/lib/utils.ts itself.
 */
export function transform(text, file = "") {
  const changes = [];
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  let out = text.replace(SIZE_RE, (match, px, named, offset) => {
    const value = px !== undefined ? Number(px) : NAMED[named];
    const step = mapPx(value, value === 12 ? contextAt(text, offset, match.length) : "");
    const to = `text-${step}`;
    changes.push({ from: match, to, line: lineOf(offset) });
    return to;
  });
  if (!/(^|\/)src\/lib\/utils\.ts$/.test(file.split(path.sep).join("/"))) {
    out = out.replace(CN_IMPORT_RE, (match, _q, offset) => {
      changes.push({ from: 'import { cn } from "cn"', to: 'import { cn } from "@/lib/utils"', line: lineOf(offset) });
      return 'import { cn } from "@/lib/utils"';
    });
  }
  return { text: out, changes };
}

/** Off-scale sizes left in a text that the codemod cannot map on its own. */
export function unmapped(text) {
  return [...text.matchAll(UNMAPPED_RE)].map((m) => ({ match: m[0], line: text.slice(0, m.index).split("\n").length }));
}

const IGNORE_MARKER = "type-scale: " + "ignore-file";
const EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function* walk(p) {
  const st = statSync(p);
  if (st.isFile()) {
    if (EXTENSIONS.has(path.extname(p))) yield p;
    return;
  }
  for (const name of readdirSync(p).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    yield* walk(path.join(p, name));
  }
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const unknown = [...flags].filter((f) => !["--check", "--dry", "--verbose"].includes(f));
  if (unknown.length) {
    console.error(`Unknown flag ${unknown.join(", ")}. Usage: node scripts/codemods/type-scale.mjs [--check|--dry] [--verbose] [paths…]`);
    return 2;
  }
  const check = flags.has("--check");
  const write = !check && !flags.has("--dry");
  const verbose = flags.has("--verbose");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const targets = argv.filter((a) => !a.startsWith("--"));
  const roots = targets.length ? targets.map((t) => path.resolve(t)) : [path.join(root, "src")];

  const tally = new Map();
  const perFile = [];
  const leftovers = [];
  for (const r of roots) {
    for (const file of walk(r)) {
      const rel = path.relative(root, file);
      const before = readFileSync(file, "utf8");
      if (before.includes(IGNORE_MARKER)) continue;
      const { text, changes } = transform(before, rel);
      for (const u of unmapped(text)) leftovers.push(`${rel}:${u.line}  ${u.match}`);
      if (!changes.length) continue;
      perFile.push({ rel, changes });
      for (const c of changes) {
        const key = `${c.from.replace(/^text-/, "")} → ${c.to.replace(/^text-/, "")}`;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      if (write) writeFileSync(file, text);
    }
  }

  const total = perFile.reduce((n, f) => n + f.changes.length, 0);
  const verb = write ? "Rewrote" : check ? "Off-scale:" : "Would rewrite";
  console.log(`${verb} ${total} class${total === 1 ? "" : "es"} in ${perFile.length} file${perFile.length === 1 ? "" : "s"}.`);
  const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of rows) console.log(`  ${String(n).padStart(4)}  ${k}`);
  if (verbose || check) {
    for (const f of perFile) for (const c of f.changes) console.log(`  ${f.rel}:${c.line}  ${c.from} → ${c.to}`);
  }
  if (leftovers.length) {
    console.log(`${leftovers.length} size${leftovers.length === 1 ? "" : "s"} the codemod can't map; move them onto the scale by hand:`);
    for (const l of leftovers) console.log(`  ${l}`);
  }
  if (check && (total > 0 || leftovers.length > 0)) {
    console.log("Run `npm run codemod:type-scale` to fix the ones it can map.");
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
