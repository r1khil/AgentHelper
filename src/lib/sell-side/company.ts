import { z } from "zod";
const base = {
  teamId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
};
export const newCallSchema = z.discriminatedUnion("companyType", [
  z.object({
    ...base,
    companyType: z.literal("holding"),
    holdingId: z.string().uuid(),
  }),
  z.object({
    ...base,
    companyType: z.literal("other"),
    companyName: z.string().trim().min(1).max(120),
    ticker: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9.:-]{0,19}$/),
  }),
]);
