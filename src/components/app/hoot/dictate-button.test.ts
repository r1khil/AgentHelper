import { beforeEach, describe, expect, it } from "vitest";
import { joinDictation, startDictation, type RecognizerClass } from "./dictate-button";

describe("joinDictation", () => {
  it("puts what was said after the typed text, one space between", () => {
    expect(joinDictation("What moved", [" NVDA today"])).toBe("What moved NVDA today");
    expect(joinDictation("What moved ", ["NVDA today"])).toBe("What moved NVDA today");
  });

  it("joins the spoken pieces and keeps an empty box empty until something is said", () => {
    expect(joinDictation("", ["How did we do", " this week "])).toBe("How did we do this week");
    expect(joinDictation("", ["", "  "])).toBe("");
    expect(joinDictation("Draft", [])).toBe("Draft");
  });
});

/** A recognizer the test drives: `say` delivers a result event, `finish` ends the run as the browser would. */
class FakeRecognizer {
  static last: FakeRecognizer;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  calls: string[] = [];
  constructor() {
    FakeRecognizer.last = this;
  }
  start() {
    this.calls.push("start");
  }
  stop() {
    this.calls.push("stop");
  }
  abort() {
    this.calls.push("abort");
  }
  say(resultIndex: number, results: [string, boolean][]) {
    const list = results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ resultIndex, results: list });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  finish() {
    this.onend?.();
  }
}

describe("startDictation", () => {
  let box: string;
  let notes: [string, string][];
  let ended: number;
  const run = (base = "") => {
    box = base;
    return startDictation(FakeRecognizer as unknown as RecognizerClass, {
      base,
      lang: "en-US",
      write: (v) => (box = v),
      onEnd: () => ended++,
      notify: (msg, tone) => notes.push([tone, msg]),
    });
  };
  beforeEach(() => {
    notes = [];
    ended = 0;
  });

  it("listens continuously with live words, after what was typed", () => {
    run("What moved");
    const r = FakeRecognizer.last;
    expect([r.continuous, r.interimResults, r.calls]).toEqual([true, true, ["start"]]);
    r.say(0, [["NVDA", false]]);
    expect(box).toBe("What moved NVDA");
    r.say(0, [["NVDA today", true], ["and why", false]]);
    expect(box).toBe("What moved NVDA today and why");
  });

  it("keeps finished phrases once, by result index, when a browser re-sends one", () => {
    run();
    const r = FakeRecognizer.last;
    r.say(0, [["how did we do", true]]);
    r.say(0, [["how did we do", true], ["this week", false]]);
    r.say(1, [["how did we do", true], ["this week", true]]);
    expect(box).toBe("how did we do this week");
  });

  it("still owns a value a render showed after a newer write (no abort mid-sentence)", () => {
    const s = run();
    const r = FakeRecognizer.last;
    r.say(0, [["What moved", false]]);
    r.say(0, [["What moved NVDA", false]]);
    expect(s.owns("What moved")).toBe(true);
    expect(s.owns("What moved NVDA")).toBe(true);
    // Once the box has shown the newer write, going back to the older text is the member's edit.
    expect(s.owns("What moved")).toBe(false);
    expect(s.owns("What moved NVDA?")).toBe(false);
    expect(s.owns("")).toBe(false);
  });

  it("ignores late results after an abort (typed in or sent)", () => {
    const s = run();
    const r = FakeRecognizer.last;
    r.say(0, [["more words", false]]);
    s.abort();
    r.say(0, [["late", true]]);
    r.finish();
    expect(box).toBe("more words");
    expect(r.calls).toContain("abort");
    expect(notes).toEqual([]);
    expect(ended).toBe(1);
  });

  it("keeps the final words after the mic stops it, without a note", () => {
    const s = run();
    const r = FakeRecognizer.last;
    r.say(0, [["how did we", false]]);
    s.stop();
    r.say(0, [["how did we do", true]]);
    r.finish();
    expect(box).toBe("how did we do");
    expect(notes).toEqual([]);
  });

  it("says so when it stops by itself or hears nothing, once", () => {
    run();
    FakeRecognizer.last.finish();
    expect(notes).toEqual([["info", "Dictation stopped. Press the mic to keep going."]]);

    notes = [];
    run();
    FakeRecognizer.last.fail("no-speech");
    FakeRecognizer.last.finish();
    expect(notes).toHaveLength(1);
    expect(notes[0][0]).toBe("error");
    expect(notes[0][1]).toMatch(/Didn't hear anything/);
  });
});
