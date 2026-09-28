import { describe, expect, it } from "vitest";
import { PACK_STATUS_LABELS, packStatus, scheduledSendAt } from "./status";

// Friday Sep 25, 2026; the Sunday job emails it Sunday Sep 27 at 12:00 New York (16:00 UTC).
const week = "2026-09-25";
const saturday = new Date("2026-09-26T15:00:00Z");
const sundayBeforeNoon = new Date("2026-09-27T15:59:00Z");
const sundayAfterNoon = new Date("2026-09-27T16:01:00Z");

describe("scheduledSendAt", () => {
  it("is the Sunday after the pack's Friday at 12:00 New York time", () => {
    expect(scheduledSendAt(week).toUTC().toISO()).toBe("2026-09-27T16:00:00.000Z");
  });
});

describe("packStatus", () => {
  it("calls a pack whose Sunday email went out Sent, even though it is still editable (was 'Emailed')", () => {
    expect(packStatus({ weekEnding: week, status: "draft", email: { status: "ok" } }, { now: sundayAfterNoon })).toBe("sent");
  });

  it("calls a pack an exec marked sent Sent, whatever happened to the email", () => {
    expect(packStatus({ weekEnding: week, status: "sent", email: null }, { now: sundayAfterNoon })).toBe("sent");
    expect(packStatus({ weekEnding: week, status: "sent", email: { status: "failed" } }, { now: sundayAfterNoon })).toBe("sent");
  });

  it("calls a pack whose last send failed Failed", () => {
    expect(packStatus({ weekEnding: week, status: "draft", email: { status: "failed" } }, { now: sundayAfterNoon })).toBe("failed");
    expect(packStatus({ weekEnding: week, status: "draft", email: { status: "failed" } }, { now: saturday })).toBe("failed");
  });

  it("calls an unsent pack Scheduled until the Sunday 12:00 job, then Draft", () => {
    expect(packStatus({ weekEnding: week, status: "draft" }, { now: saturday })).toBe("scheduled");
    expect(packStatus({ weekEnding: week, status: "draft" }, { now: sundayBeforeNoon })).toBe("scheduled");
    expect(packStatus({ weekEnding: week, status: "draft" }, { now: sundayAfterNoon })).toBe("draft");
  });

  it("calls it Draft, not Scheduled, when the list is paused or the email was held", () => {
    expect(packStatus({ weekEnding: week, status: "draft" }, { now: saturday, paused: true })).toBe("draft");
    expect(packStatus({ weekEnding: week, status: "draft", email: { status: "held" } }, { now: sundayAfterNoon })).toBe("draft");
  });

  it("has one label per status", () => {
    expect(Object.values(PACK_STATUS_LABELS)).toEqual(["Draft", "Scheduled", "Sent", "Failed"]);
  });
});
