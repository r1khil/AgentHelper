import { describe, expect, it } from "vitest";
import { MOVEMENT_THRESHOLD_PP } from "./constants";
import { ONBOARDING_STEPS, TOUR_CARDS, completeOnboardingSchema, parseCompleteOnboarding } from "./onboarding";

describe("completeOnboardingSchema", () => {
  it("accepts a name and the acknowledgement, trimming the name", () => {
    const r = completeOnboardingSchema.safeParse({ fullName: "  Test Analyst  ", acknowledged: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fullName).toBe("Test Analyst");
  });

  it("rejects a missing or blank name", () => {
    expect(completeOnboardingSchema.safeParse({ fullName: "   ", acknowledged: "on" }).success).toBe(false);
    expect(completeOnboardingSchema.safeParse({ acknowledged: "on" }).success).toBe(false);
  });

  it("requires the learning boundary to be acknowledged", () => {
    for (const acknowledged of [undefined, "", "off", "true"]) {
      const r = completeOnboardingSchema.safeParse({ fullName: "Test Analyst", acknowledged });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe("Confirm the learning boundary to continue");
    }
  });

  it("reads the form fields the flow submits", () => {
    const fd = new FormData();
    fd.set("fullName", "Test Analyst");
    fd.set("acknowledged", "on");
    expect(parseCompleteOnboarding(fd).success).toBe(true);
    fd.set("acknowledged", "");
    expect(parseCompleteOnboarding(fd).success).toBe(false);
  });
});

describe("onboarding copy", () => {
  it("has four ordered steps ending with the boundary", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(["welcome", "name", "tour", "boundary"]);
  });

  it("states the movement threshold from constants", () => {
    const movements = TOUR_CARDS.find((c) => c.id === "movements");
    expect(movements?.body).toContain(`${MOVEMENT_THRESHOLD_PP * 100} bp (${MOVEMENT_THRESHOLD_PP} percentage points)`);
  });
});
