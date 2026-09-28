import { z } from "zod";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { fmtBp } from "@/lib/format";

/** First-sign-in setup, in order. Shared by the page, the flow component, and tests. */
export const ONBOARDING_STEPS = [
  { id: "profile", label: "Profile" },
  { id: "tour", label: "Tour" },
  { id: "boundary", label: "The boundary" },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export const completeOnboardingSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(120, "Keep your name under 120 characters"),
  acknowledged: z.literal("on", { error: "Confirm the learning boundary to continue" }),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;

export function parseCompleteOnboarding(fd: FormData) {
  return completeOnboardingSchema.safeParse({ fullName: fd.get("fullName"), acknowledged: fd.get("acknowledged") });
}

/**
 * The product's core rule (docs/product.md), said once to the user here and nowhere else in the UI. Hoot's own
 * instructions still carry it in full.
 */
export const LEARNING_BOUNDARY =
  "Hoot gathers evidence, explains concepts and questions your reasoning. You write the movement updates, earnings reflections and theses; Hoot never drafts them, and the workspace has no button for it.";

/** What Hoot does under that rule. None of these restate it. */
export const BOUNDARY_IMPLICATIONS = [
  "Every number Hoot shows carries a source you can open and check.",
  "Ask for evidence, explanations and counterarguments as often as you like.",
  "After you write, ask Hoot for feedback: he flags unsupported claims, missing evidence, alternative explanations and contradictions with the thesis.",
] as const;

export type TourCard = { id: string; title: string; body: string };

export const TOUR_CARDS: TourCard[] = [
  {
    id: "holdings",
    title: "Holdings",
    body: "Each ticker your team covers gets a live quote, its day move against the S&P 500, filings, news, notes, an owner, and the team's thesis.",
  },
  {
    id: "movements",
    title: "Major movements",
    body: `After each close, any holding whose daily return differs from the S&P 500 by ${fmtBp(MOVEMENT_THRESHOLD_PP * 100)} (${MOVEMENT_THRESHOLD_PP} percentage points) or more opens an investigation with evidence, and its update is due by noon New York on the next trading day.`,
  },
  {
    id: "earnings",
    title: "Earnings",
    body: "The next report date is tracked for every holding. Your expectations lock at the report so the reflection is honest; actuals come from the release and XBRL, with anything missing shown as missing.",
  },
  {
    id: "agent",
    title: "Hoot",
    body: "Your research companion: click him at the bottom of the menu, or open Research. He works with tools for quotes, price history, EDGAR filings, XBRL facts, news, and the earnings calendar. Filings and company releases come first, news second, and every claim carries a source chip.",
  },
];
