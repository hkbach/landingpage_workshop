import { z } from "zod";
import { BOOKING_CODE_RE, LOCALES } from "@workshop/shared";

// FR-BOOK-02. Every text is trimmed (BR-16) and an email is lowercased; the price is never part of the body (BR-04: the server works it out).
const email = z.string({ error: "required" }).trim().toLowerCase().min(1, "required").max(254, "tooLong").pipe(z.email("invalid"));
const turnstileToken = z.string().trim().max(2048).optional();

export const otpRequestSchema = z.object({ email, turnstileToken });

export const bookingCreateSchema = z.object({
  sessionId: z.uuid({ error: "invalid" }),
  quantity: z.number({ error: "quantityRange" }).int("quantityRange").min(1, "quantityRange").max(50, "quantityRange"),
  guest: z.object({
    fullName: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong"),
    email,
    country: z.string({ error: "required" }).trim().toUpperCase().regex(/^[A-Z]{2}$/, "invalid"),
    phone: z.string({ error: "required" }).trim().min(5, "required").max(30, "tooLong"),
    specialRequest: z.string().trim().max(500, "tooLong").optional(),
  }, { error: "required" }),
  /** The guest agreed to the policy (late arrival included). */
  consent: z.literal(true, { error: "consentRequired" }),
  otp: z.string({ error: "required" }).trim().regex(/^\d{6}$/, "invalid"),
  locale: z.enum(LOCALES).default("en"),
  /** The promotions the guest chose (ids of the promotions shown on the landing page). The server checks them and works the price out; a total sent by the client is never read. */
  promotionIds: z.array(z.uuid({ error: "invalid" })).max(10, "tooMany").optional(),
  /** The affiliate code of the link the guest came through (a wrong one is ignored, never an error). */
  ref: z.string().trim().max(20).optional(),
  turnstileToken,
});
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

export const confirmSchema = z.object({ token: z.string({ error: "required" }).trim().min(20, "invalid").max(200, "invalid") });

const code = z.string({ error: "required" }).trim().toUpperCase().regex(BOOKING_CODE_RE, "invalid");
export const lookupSchema = z.object({ code, email });
export const cancelSchema = z.object({ code, email, reason: z.string().trim().max(300, "tooLong").optional() });

export const availabilityQuery = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() });

export const idempotencyKey = z.string({ error: "required" }).trim().min(8, "invalid").max(100, "invalid").regex(/^[A-Za-z0-9_.:-]+$/, "invalid");
