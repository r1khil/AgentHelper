import type { Observation, EvidenceDocument } from "./contracts";
import { calendarFrom } from "./movement";
export const fixtureSessions = [
  { day: "2026-03-06", close: "2026-03-06T16:00:00-05:00" },
  { day: "2026-03-09", close: "2026-03-09T16:00:00-04:00" },
  { day: "2026-09-04", close: "2026-09-04T16:00:00-04:00" },
  { day: "2026-09-08", close: "2026-09-08T16:00:00-04:00" },
  { day: "2026-09-09", close: "2026-09-09T16:00:00-04:00" },
  { day: "2026-09-10", close: "2026-09-10T16:00:00-04:00" },
  { day: "2026-09-11", close: "2026-09-11T16:00:00-04:00" },
  { day: "2026-09-14", close: "2026-09-14T16:00:00-04:00" },
  { day: "2026-11-25", close: "2026-11-25T16:00:00-05:00" },
  { day: "2026-11-27", close: "2026-11-27T13:00:00-05:00" },
  { day: "2026-11-30", close: "2026-11-30T16:00:00-05:00" },
];
export const calendar = calendarFrom(fixtureSessions);
export const FIXTURE_DAY = "2026-09-10";
export function observation(
  securityId: string,
  value: string,
  previousClose = "100",
  day = FIXTURE_DAY,
): Observation {
  return {
    securityId,
    value,
    previousClose,
    session: day,
    observedAt: calendar.session(day)?.close ?? `${day}T16:00:00-04:00`,
    official: true,
    corporateAction: "none",
    basis: "split-adjusted-price",
    provider: "synthetic-fixture",
    currency: "USD",
  };
}
export function fixtureEvidence(ticker: string): EvidenceDocument[] {
  return ticker === "THC"
    ? [
        {
          key: "thc-announcement",
          title: "THC · synthetic operating commentary",
          publisher: "Development fixture",
          publishedAt: "2026-09-10T13:00:00Z",
          location: "Fixture paragraph 1",
          content:
            "Synthetic scenario: the company described improving procedure volumes. This text is invented for testing and is not a real company disclosure.",
          category: "announcement",
          fact: "The synthetic announcement describes improving procedure volumes.",
          hypothesis:
            "Could the operating commentary be relevant to the move? Compare timing and peers before attributing causality.",
        },
        {
          key: "thc-peer",
          title: "Healthcare peers · synthetic comparison",
          publisher: "Development fixture",
          publishedAt: "2026-09-10T20:00:00Z",
          location: "Fixture table row 1",
          content:
            "Synthetic peer basket return: +1.2%. This is invented, not market data.",
          category: "peer",
          fact: "The synthetic healthcare peer basket rose 1.2%.",
        },
      ]
    : [
        {
          key: "dram-sector",
          title: "DRAM · synthetic sector context",
          publisher: "Development fixture",
          publishedAt: "2026-09-10T14:00:00Z",
          location: "Fixture paragraph 1",
          content:
            "Synthetic scenario: a sector report discusses softer near-term pricing. This is invented test material.",
          category: "sector",
          fact: "The synthetic sector report discusses softer pricing.",
          hypothesis:
            "Could sector pricing expectations be relevant? Establish exposure and timing before drawing a conclusion.",
        },
        {
          key: "dram-constituents",
          title: "DRAM · synthetic constituent context",
          publisher: "Development fixture",
          publishedAt: "2026-09-10T20:00:00Z",
          location: "Fixture table rows 1–2",
          content:
            "Synthetic constituents A and B return -4.8% and -2.1%. Holdings and returns are invented for testing.",
          category: "constituent",
          fact: "Both synthetic constituents declined; their weights are unavailable.",
        },
      ];
}
export const fixtureModel = {
  async review(
    _reasoning: string,
    sourceIds: string[],
    approvedThesis: string | null,
  ) {
    return {
      mode: "fixture" as const,
      sourceIds,
      questions: [
        "Which source supports each factual claim in your update?",
        "What evidence distinguishes your catalyst hypothesis from an alternative explanation?",
        approvedThesis
          ? "Which part of the approved thesis does your evidence support or challenge?"
          : "An approved thesis is missing. What context should the team record?",
      ],
      limitations:
        "Scripted learning prompts, not model analysis. No claim-level verification or investment conclusion is produced.",
    };
  },
};
