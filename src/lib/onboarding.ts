import { z } from "zod";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { fmtBp } from "@/lib/format";

/** First-sign-in setup, in order. Shared by the page, the flow component, and tests. */
export const ONBOARDING_STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "name", label: "Your name" },
  { id: "tour", label: "How the workspace works" },
  { id: "boundary", label: "The learning boundary" },
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
  "One rule shapes every feature. Hoot gathers evidence, explains concepts and asks questions, and it cites a source for every fact. It never writes your update, your reflection, your thesis or your conclusion, and the workspace has no button for it.";

/** What Hoot does under that rule, and what stays yours. Neither restates it. */
export const BOUNDARY_HOOT_DOES = [
  "Finds filings, news, closes and team files, each with a source you can open",
  "Explains a concept or a number, and argues the other side when you ask",
  "Flags unsupported claims, missing evidence and contradictions with the thesis after you write",
] as const;

export const BOUNDARY_YOU_DO = ["Write the movement update", "Write the earnings reflection", "Decide what it means for the thesis"] as const;

export type TourCard = { id: string; title: string; body: string };

export const TOUR_CARDS: TourCard[] = [
  {
    id: "holdings",
    title: "Holdings",
    body: "Each ticker your team covers gets a live quote, its day move against the S&P 500, filings, news, notes, and the team's thesis. The whole team shares each holding and its movement write-ups.",
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
    body: "Your research companion: click him in the corner of any page, press ⌘J, or open Research. He works with tools for quotes, price history, EDGAR filings, XBRL facts, news, and the earnings calendar. Filings and company releases come first, news second, and every claim carries a source chip.",
  },
];
