// What the fee-rate routes of the admin share: the body of a request and the 422 of a refused rate.
import { z } from "zod";
import { apiError } from "@/lib/api-error";
import type { AllRatesCheck } from "@/lib/mock/fee-rates-store";

// `referralBps` is the affiliate fee (the link of a workshop); `inviteBonusBps` the referral bonus (a friend invited to register), left out = unchanged.
export const ratesSchema = z.object({ maintenanceBps: z.number({ error: "invalid" }), serviceBps: z.number({ error: "invalid" }), referralBps: z.number({ error: "invalid" }), inviteBonusBps: z.number({ error: "invalid" }).optional() });

/** The 422 of a refused rate, naming the field. */
export function ratesError(check: Exclude<AllRatesCheck, "OK">): Response {
  const field = check === "MAINTENANCE_INVALID" ? "maintenanceBps" : check === "REFERRAL_INVALID" ? "referralBps" : check === "BONUS_INVALID" ? "inviteBonusBps" : "serviceBps";
  return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { [field]: check === "TOTAL_TOO_HIGH" ? "totalTooHigh" : "invalid" } });
}
