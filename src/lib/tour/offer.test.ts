import { describe, expect, it } from "vitest";
import { cleanTourRecord, LATER_MS, tourOffer } from "./offer";
import { WHATS_NEW_TOUR as tour, WHATS_NEW_TOUR_ID as id } from "./whats-new";

const now = new Date("2026-09-26T14:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("tourOffer", () => {
  it("offers the tour to execs and admins only", () => {
    expect(tourOffer(tour, "exec", {}, now)).toEqual({ mode: "new", themed: false });
    expect(tourOffer(tour, "admin", null, now)).toEqual({ mode: "new", themed: false });
    expect(tourOffer(tour, "lead_analyst", {}, now)).toBeNull();
    expect(tourOffer(tour, "associate_analyst", {}, now)).toBeNull();
  });

  it("waits a day after Later, and skips the theme question if it was answered", () => {
    const later = (at: string) => ({ tours: { [id]: { status: "later" as const, themed: true, at } } });
    expect(tourOffer(tour, "exec", later(ago(LATER_MS - 60_000)), now)).toBeNull();
    expect(tourOffer(tour, "exec", later(ago(LATER_MS + 60_000)), now)).toEqual({ mode: "later", themed: true });
  });

  it("never comes back on its own once done or declined", () => {
    expect(tourOffer(tour, "admin", { tours: { [id]: { status: "done", at: ago(1000) } } }, now)).toBeNull();
  });

  it("resumes at the saved chapter, ignoring chapters that no longer exist", () => {
    expect(tourOffer(tour, "exec", { tours: { [id]: { status: "active", chapter: "exposure", themed: true, at: ago(1000) } } }, now)).toEqual({ mode: "resume", chapter: "exposure", themed: true });
    expect(tourOffer(tour, "exec", { tours: { [id]: { status: "active", chapter: "gone", at: ago(1000) } } }, now)).toEqual({ mode: "resume", chapter: undefined, themed: false });
  });

  it("keeps other tours and nudges out of it", () => {
    expect(tourOffer(tour, "exec", { dismissed: { "tip:today": ago(1000) }, tours: { "other-tour": { status: "done", at: ago(1000) } } }, now)).toEqual({ mode: "new", themed: false });
  });
});

describe("cleanTourRecord", () => {
  it("keeps known fields and stamps the time", () => {
    expect(cleanTourRecord(tour, { status: "active", chapter: "risk", themed: true, extra: "x" }, now)).toEqual({ status: "active", chapter: "risk", themed: true, at: now.toISOString() });
  });

  it("drops unknown chapters and rejects bad statuses", () => {
    expect(cleanTourRecord(tour, { status: "later", chapter: "../../etc" }, now)).toEqual({ status: "later", at: now.toISOString() });
    expect(cleanTourRecord(tour, { status: "hacked" }, now)).toBeNull();
    expect(cleanTourRecord(tour, "done", now)).toBeNull();
  });
});

describe("the what's-new script", () => {
  const steps = tour.chapters.flatMap((c) => c.steps);

  it("has unique step ids and a go step opening every page chapter", () => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    for (const c of tour.chapters.filter((c) => !["menu", "wrap"].includes(c.id))) expect(c.steps[0].kind).toBe("go");
  });

  it("says where the numbers come from on every page section", () => {
    const pageSections = tour.chapters
      .filter((c) => ["today", "risk", "exposure", "backtesting", "calendar"].includes(c.id))
      .flatMap((c) => c.steps.filter((s) => s.kind === "info"));
    // The method, lookback-toggle and ETF-toggle steps explain controls rather than numbers.
    const exempt = new Set(["risk-method", "exposure-toolbar"]);
    for (const s of pageSections.filter((s) => !exempt.has(s.id))) expect(s.source, s.id).toBeTruthy();
  });

  it("matches each chapter's route to its page", () => {
    const route = (id: string) => tour.chapters.find((c) => c.id === id)!.route;
    expect(route("risk").test("/risk")).toBe(true);
    expect(route("risk").test("/t/tech/risk")).toBe(true);
    expect(route("exposure").test("/exposure")).toBe(true);
    expect(route("calendar").test("/t/fund/economic-calendar")).toBe(true);
    expect(route("hoot").test("/t/fund/agent")).toBe(true);
    expect(route("hoot").test("/t/fund/agent/abc")).toBe(false);
    expect(route("today").test("/")).toBe(true);
    expect(route("today").test("/risk")).toBe(false);
  });
});
