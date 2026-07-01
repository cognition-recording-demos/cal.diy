import { z } from "zod";

export type TFindInputSchema = {
  bookingUid?: string;
  attendeeEmail?: string;
};

export const ZFindInputSchema: z.ZodType<TFindInputSchema> = z.object({
  bookingUid: z.string().optional(),
  attendeeEmail: z.string().email().optional(),
});
