import { z } from "zod";
import { COUNTRY_CODES } from "./countries";

// Error messages are i18n keys under site.booking.errors (see zod-resolver.ts).
export const bookingContactSchema = z.object({
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().min(1, "required").pipe(z.email("email")),
  country: z.string().refine((c) => COUNTRY_CODES.includes(c), "required"),
  phone: z.string().trim().min(1, "required").max(40, "tooLong"),
  specialRequest: z.string().trim().max(500, "max500").optional(),
  consent: z.boolean().refine((v) => v === true, "consent"),
});
export type BookingFormValues = z.infer<typeof bookingContactSchema>;
