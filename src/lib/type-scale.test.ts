// type-scale: ignore-file (these strings are the codemod's fixtures)
/* eslint-disable owl/type-scale */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCALE, transform, unmapped } from "../../scripts/codemods/type-scale.mjs";
import { cn, TYPE_SCALE } from "./utils";

describe("type scale", () => {
  it("globals.css defines exactly the codemod's steps", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../app/globals.css"), "utf8");
    for (const [name, { px, leading }] of Object.entries(SCALE)) {
      expect(css).toContain(`--text-${name}: ${px}px;`);
      expect(css).toContain(`--text-${name}--line-height: ${leading}px;`);
    }
    expect([...TYPE_SCALE]).toEqual(Object.keys(SCALE));
  });

  it("cn keeps a scale size next to a text color, and resolves size against size", () => {
    expect(cn("text-body text-muted-foreground")).toBe("text-body text-muted-foreground");
    expect(cn("text-caption", "text-down")).toBe("text-caption text-down");
    expect(cn("text-body text-muted-foreground", "text-caption")).toBe("text-muted-foreground text-caption");
  });
});

describe("type-scale codemod", () => {
  const run = (s: string) => transform(s).text;

  it("maps each old size to its step", () => {
    expect(run('"text-[10px] text-[10.5px] text-[11px] text-[11.5px]"')).toBe('"text-caption text-caption text-caption text-caption"');
    expect(run('"text-[12.5px] text-[12.8px] text-[13px] text-[13.5px] text-[14px] text-sm"')).toBe('"text-body text-body text-body text-body text-body text-body"');
    expect(run('"text-[14.5px] text-[15px] text-base"')).toBe('"text-emph text-emph text-emph"');
    expect(run('"text-[17px] text-[19px] text-lg text-xl"')).toBe('"text-title text-title text-title text-title"');
    expect(run('"text-2xl text-[26px] text-[28px]"')).toBe('"text-display text-display text-display"');
    expect(run('"text-[44px]"')).toBe('"text-hero"');
  });

  it("sends 12px to caption only in a compact element", () => {
    expect(run('"inline-flex h-[22px] rounded-full px-[9px] text-xs font-medium"')).toBe('"inline-flex h-[22px] rounded-full px-[9px] text-caption font-medium"');
    expect(run('"text-xs tracking-widest"')).toBe('"text-caption tracking-widest"');
    expect(run('"flex h-7 rounded-full px-3 font-mono text-xs"')).toBe('"flex h-7 rounded-full px-3 font-mono text-body"');
    // A stacked secondary line (top margin, block, truncating) is caption; a plain paragraph or cell is body.
    expect(run('"mt-1 truncate text-xs text-muted-foreground"')).toBe('"mt-1 truncate text-caption text-muted-foreground"');
    expect(run('"text-xs text-muted-foreground"')).toBe('"text-body text-muted-foreground"');
    expect(run('"grid h-9 items-center border-b truncate text-xs"')).toBe('"grid h-9 items-center border-b truncate text-body"');
    // The context is the string the class sits in, not its neighbors.
    expect(run('cn("rounded-full", "text-[12px]")')).toBe('cn("rounded-full", "text-body")');
  });

  it("keeps variants, modifiers and important markers", () => {
    expect(run('"md:text-[13px] hover:text-sm [&_h1]:text-base group-data-[size=sm]/card:text-sm"')).toBe(
      '"md:text-body hover:text-body [&_h1]:text-emph group-data-[size=sm]/card:text-body"',
    );
    expect(run("`text-sm/6 ${x} !text-[11px] text-xs!`")).toBe("`text-body/6 ${x} !text-caption text-body!`");
  });

  it("leaves colors, alignment and look-alikes alone", () => {
    const s = '"text-muted-foreground text-left text-balance text-hoot-foreground text-caution prose-sm --text-xs size-sm"';
    expect(run(s)).toBe(s);
  });

  it("points cn at @/lib/utils except in utils itself", () => {
    expect(run('import { cn } from "cn"')).toBe('import { cn } from "@/lib/utils"');
    expect(transform('import { cn } from "cn"', "src/lib/utils.ts").text).toBe('import { cn } from "cn"');
  });

  it("is idempotent", () => {
    const once = run('"text-[12.5px] md:text-sm text-xs rounded-full"');
    expect(transform(once).changes).toEqual([]);
  });

  it("reports sizes it cannot map", () => {
    expect(unmapped('"text-[0.8rem] text-[length:var(--x)] text-body"').map((u) => u.match)).toEqual(["text-[0.8rem]", "text-[length:var(--x)]"]);
  });
});
