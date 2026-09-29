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
    expect(tourOffer(tour, "exec", { tours: { [id]: { status: "active", chapter: "markets", themed: true, at: ago(1000) } } }, now)).toEqual({ mode: "resume", chapter: "markets", themed: true });
    expect(tourOffer(tour, "exec", { tours: { [id]: { status: "active", chapter: "gone", at: ago(1000) } } }, now)).toEqual({ mode: "resume", chapter: undefined, themed: false });
  });

  it("keeps other tours and nudges out of it", () => {
    expect(tourOffer(tour, "exec", { dismissed: { "tip:today": ago(1000) }, tours: { "other-tour": { status: "done", at: ago(1000) } } }, now)).toEqual({ mode: "new", themed: false });
  });
});

describe("cleanTourRecord", () => {
  it("keeps known fields and stamps the time", () => {
    expect(cleanTourRecord(tour, { status: "active", chapter: "portfolio", themed: true, extra: "x" }, now)).toEqual({ status: "active", chapter: "portfolio", themed: true, at: now.toISOString() });
  });

  it("drops unknown chapters and rejects bad statuses", () => {
    expect(cleanTourRecord(tour, { status: "later", chapter: "../../etc" }, now)).toEqual({ status: "later", at: now.toISOString() });
    expect(cleanTourRecord(tour, { status: "hacked" }, now)).toBeNull();
    expect(cleanTourRecord(tour, "done", now)).toBeNull();
  });
});

describe("the new-look tour script", () => {
  const steps = tour.chapters.flatMap((c) => c.steps);

  it("has unique step ids and a go step opening every page chapter", () => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    for (const c of tour.chapters.filter((c) => !["menu", "wrap"].includes(c.id))) expect(c.steps[0].kind).toBe("go");
  });

  it("tells the member what to click on every go step, and says something on every info step", () => {
    for (const s of steps.filter((s) => s.kind === "go")) expect(s.target && s.prompt, s.id).toBeTruthy();
    for (const s of steps.filter((s) => s.kind === "info")) expect(s.body || s.what || s.points?.length, s.id).toBeTruthy();
  });

  it("says where the numbers come from on the sections that show figures", () => {
    const figures = ["bell", "portfolio-views", "markets-schedule"];
    for (const id of figures) expect(steps.find((s) => s.id === id)?.source, id).toBeTruthy();
  });

  it("only waits on the sidebar: steps inside a page talk from the middle, so a page's layout can't strand the tour", () => {
    const sidebar = ['[data-tour="sidebar"]', '[data-tour="command"]', '[data-tour="ask-hoot"]', '[data-tour="threads"]', '[data-tour="bell"]', '[data-tour="account"]', '[data-tour="nav-portfolio"]', '[data-tour="nav-markets"]'];
    for (const s of steps.filter((s) => s.kind === "info" && s.target)) expect(sidebar, s.id).toContain(s.target);
  });

  it("matches each chapter's route to its page", () => {
    const route = (id: string) => tour.chapters.find((c) => c.id === id)!.route;
    expect(route("portfolio").test("/t/fund")).toBe(true);
    expect(route("portfolio").test("/t/tech/risk")).toBe(true);
    expect(route("portfolio").test("/t/fund/what-if")).toBe(true);
    expect(route("portfolio").test("/t/fund/h/NVDA")).toBe(false);
    expect(route("portfolio").test("/t/fund/movements")).toBe(false);
    expect(route("holding").test("/t/tech/h/NVDA")).toBe(true);
    expect(route("markets").test("/markets")).toBe(true);
    expect(route("markets").test("/t/fund/earnings")).toBe(false);
  });
});
