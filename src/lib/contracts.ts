import { z } from "zod";
export type Observation = {
  securityId: string;
  session: string;
  value: string;
  previousClose: string;
  observedAt: string;
  official: boolean;
  corporateAction: "none" | "adjusted" | "ambiguous";
  basis: "split-adjusted-price";
  provider: string;
  currency: string;
};
export type TradingSession = { day: string; close: string };
export interface MarketDataAdapter {
  close(securityId: string, session: string): Promise<Observation | null>;
}
export interface CalendarAdapter {
  session(day: string): TradingSession | undefined;
  next(day: string): TradingSession | undefined;
}
export interface EvidenceAdapter {
  collect(securityId: string, session: string): Promise<EvidenceDocument[]>;
}
export type EvidenceDocument = {
  key: string;
  title: string;
  publisher: string;
  publishedAt: string;
  location: string;
  content: string;
  category:
    "announcement" | "filing" | "peer" | "sector" | "constituent" | "catalyst";
  catalystAt?: string;
  fact: string;
  hypothesis?: string;
};
export type Identity = { subject: string; name: string; email: string };
export interface IdentityAdapter {
  identity(): Promise<Identity | null>;
}
export const feedbackSchema = z.object({
  mode: z.literal("fixture"),
  questions: z.array(z.string()).max(8),
  sourceIds: z.array(z.string().uuid()).max(20),
  limitations: z.string(),
});
export type Feedback = z.infer<typeof feedbackSchema>;
export interface ModelFeedbackAdapter {
  review(
    reasoning: string,
    sourceIds: string[],
    approvedThesis: string | null,
  ): Promise<Feedback>;
}
export interface DeliveryAdapter {
  mode: "capture";
  capture(
    key: string,
    subject: string,
    body: string,
    recipients: string[],
  ): Promise<void>;
}
