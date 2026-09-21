import { describe, expect, it } from "vitest";
import { bulletCount, extractJsonObject, prepAttempts, repairJson, selectPrepCandidates, validatePrepPack } from "./prep-pack";

const src = (id: string) => ({ id, title: id, publisher: "SEC", retrievedAt: "r" });
const known = new Map([src("xbrl-1"), src("doc-2")].map((s) => [s.id, s]));

describe("validatePrepPack", () => {
  it("keeps cited bullets, drops unknown sources and predictive language, and carries only cited sources", () => {
    const raw = {
      sections: [
        { key: "last_quarter", bullets: [{ text: "Q2 revenue $19.6B", sourceIds: ["xbrl-1"] }, { text: "Made up $1B", sourceIds: ["nope"] }, { text: "We expect a beat", sourceIds: ["xbrl-1"] }, { text: "", sourceIds: [] }] },
        { key: "consensus", bullets: [{ text: "Consensus EPS $4.59 (23 analysts) [src:doc-2]", sourceIds: ["src:doc-2", "doc-2"] }] },
        { key: "not_retrieved", bullets: [{ text: "Segment detail", sourceIds: [] }] },
        { key: "bogus", bullets: [{ text: "x", sourceIds: ["xbrl-1"] }] },
      ],
    };
    const { pack, dropped } = validatePrepPack(raw, known, { reportDate: "2026-10-23", model: "m", builtAt: "2026-09-21T00:00:00Z" });
    expect(pack.sections.map((s) => s.key)).toEqual(["last_quarter", "consensus", "not_retrieved"]);
    expect(pack.sections[0].bullets).toEqual([{ text: "Q2 revenue $19.6B", sourceIds: ["xbrl-1"] }]);
    expect(pack.sections[1].bullets[0]).toEqual({ text: "Consensus EPS $4.59 (23 analysts)", sourceIds: ["doc-2"] });
    expect(pack.sections[1].title).toBe("Street consensus (not guidance)");
    expect(pack.sources.map((s) => s.id).sort()).toEqual(["doc-2", "xbrl-1"]);
    expect(dropped).toMatchObject({ unknownSource: 1, predictive: 1, empty: 1 });
    expect(dropped.samples).toEqual(["unknown source: Made up $1B [nope]", "predictive: We expect a beat"]);
    expect(bulletCount(pack)).toBe(2);
  });
  it("accepts sections keyed by name", () => {
    const { pack } = validatePrepPack({ sections: { last_quarter: [{ text: "Revenue $19.6B", sourceIds: ["xbrl-1"] }], watch_items: { bullets: [{ text: "Watch credit", sourceIds: ["doc-2"] }] } } }, known, { reportDate: "d", model: "m" });
    expect(pack.sections.map((s) => [s.key, s.bullets.length])).toEqual([["last_quarter", 1], ["watch_items", 1]]);
  });
  it("handles garbage input", () => {
    const { pack } = validatePrepPack("nonsense", known, { reportDate: "d", model: "m" });
    expect(pack.sections).toEqual([]);
    expect(pack.sources).toEqual([]);
  });
});

describe("extractJsonObject", () => {
  it("finds the object inside prose", () => {
    expect(extractJsonObject('Here: {"a":1} done')).toEqual({ a: 1 });
    expect(extractJsonObject("nothing")).toBeNull();
  });
  it("repairs trailing commas and code fences", () => {
    expect(extractJsonObject('```json\n{"sections":[{"key":"consensus","bullets":[{"text":"x","sourceIds":["a"],},],},]}\n```')).toEqual({ sections: [{ key: "consensus", bullets: [{ text: "x", sourceIds: ["a"] }] }] });
  });
  it("closes an object the output limit cut off", () => {
    const cut = 'Let me compile. {"sections":[{"key":"last_quarter","bullets":[{"text":"Revenue $19.6B [ok]","sourceIds":["xbrl-1"]},{"text":"Net income $3.1B","sourceIds":["xbrl-1"]},{"text":"Half a bul';
    // The half-written bullet after the last complete value is dropped rather than guessed at.
    const r = extractJsonObject(cut) as { sections: { bullets: { text: string }[] }[] };
    expect(r.sections[0].bullets.map((b) => b.text)).toEqual(["Revenue $19.6B [ok]", "Net income $3.1B"]);
    // A section with nothing complete in it is dropped with the partial bullet.
    const cut2 = '{"sections":[{"key":"consensus","bullets":[{"text":"EPS 4.59","sourceIds":["a"]}]},{"key":"watch_items","bullets":[{"text":';
    expect((extractJsonObject(cut2) as { sections: { key: string }[] }).sections.map((s) => s.key)).toEqual(["consensus"]);
  });
  it("ignores braces inside strings when balancing", () => {
    expect(repairJson('{"a":"x { y"')).toBe('{"a":"x { y"}');
  });
});

describe("selectPrepCandidates", () => {
  const row = (id: string, reportDate: string, over: Partial<{ status: string; prepPackAt: Date | null; prepPackError: string | null }> = {}) => ({ id, reportDate, status: "upcoming", prepPackAt: null, prepPackError: null, ...over });
  it("picks upcoming reports in the window without a pack, soonest first, capped", () => {
    const rows = [row("late", "2026-10-30"), row("b", "2026-09-25"), row("a", "2026-09-23"), row("done", "2026-09-24", { prepPackAt: new Date() }), row("past", "2026-09-19"), row("reported", "2026-09-24", { status: "reported" }), row("failed-once", "2026-09-24", { prepPackError: "attempt 1: boom" }), row("failed-twice", "2026-09-24", { prepPackError: "attempt 2: boom" })];
    expect(selectPrepCandidates(rows, { from: "2026-09-21", to: "2026-09-28" }, 3).map((r) => r.id)).toEqual(["a", "failed-once", "b"]);
  });
  it("counts attempts from the error prefix", () => {
    expect(prepAttempts(null)).toBe(0);
    expect(prepAttempts("boom")).toBe(1);
    expect(prepAttempts("attempt 2: boom")).toBe(2);
  });
});
