import { z } from "zod";
import { BOOKING_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from "@workshop/shared";
import { isRealDate } from "../common/zoned-time";

const email = z.string().trim().toLowerCase().max(254, "tooLong").pipe(z.email("invalid"));

export const bookingListQuery = z.object({
  date: z.string().trim().refine(isRealDate, "dateInvalid").optional(),
  sessionId: z.uuid().optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});

export const manualBookingSchema = z
  .object({
    sessionId: z.uuid({ error: "invalid" }),
    quantity: z.number({ error: "quantityRange" }).int("quantityRange").min(1, "quantityRange").max(50, "quantityRange"),
    source: z.enum(["WALK_IN", "PHONE", "OTHER"], { error: "invalid" }),
    fullName: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong"),
    email: z.union([email, z.literal("")]).optional().transform((v) => v || undefined),
    phone: z.string().trim().max(30, "tooLong").optional(),
    country: z.union([z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "invalid"), z.literal("")]).optional().transform((v) => v || undefined),
    specialRequest: z.string().trim().max(500, "tooLong").optional(),
  })
  .superRefine((v, ctx) => {
    // A booking made by phone needs a way to reach the guest; a walk-in may have none.
    if (v.source === "PHONE" && !v.email && !v.phone) ctx.addIssue({ code: "custom", path: ["phone"], message: "required" });
  });

export const cancelBookingSchema = z.object({ reason: z.string({ error: "required" }).trim().min(1, "required").max(500, "tooLong") });
export const paymentSchema = z.object({ paid: z.boolean({ error: "required" }), method: z.enum(PAYMENT_METHODS).optional(), note: z.string().trim().max(300, "tooLong").optional() });

export const customerListQuery = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
