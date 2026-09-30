import { z } from "zod";

/** First-sign-in setup, in order. Shared by the page, the flow component, and tests. */
export const ONBOARDING_STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "name", label: "Your name" },
  { id: "tour", label: "How it works" },
  { id: "boundary", label: "Learning boundary" },
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

/** The product's core rule (docs/product.md), said once here. Hoot's own instructions carry it in full. */
export const LEARNING_BOUNDARY = "Hoot finds and cites evidence. It doesn't write your analysis, and the app has no button that does.";

/** What Hoot does under that rule, and what stays yours. */
export const BOUNDARY_HOOT_DOES = ["Finds filings, news, prices and team files, with sources", "Explains concepts and numbers", "Flags gaps in your reasoning after you write"] as const;

export const BOUNDARY_YOU_DO = ["Write earnings expectations and reflections", "Write and update the thesis", "Decide what the evidence means"] as const;

export type TourCard = { id: string; title: string; body: string };

export const TOUR_CARDS: TourCard[] = [
  {
    id: "hoot",
    title: "Hoot",
    body: "Ask from Home, or press ⌘J on any page. Answers cite filings, XBRL, news and the team's Drive files.",
  },
  {
    id: "holdings",
    title: "Holdings",
    body: "One page per ticker: price, move against the S&P 500, filings, notes, the model and the team's thesis.",
  },
  {
    id: "earnings",
    title: "Earnings",
    body: "Upcoming reports are on Markets. Write your expectations before the report; they lock on the report date.",
  },
];
