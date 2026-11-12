import { z } from "zod";
import { CLOSE_REASON_NOTE_MAX, MAX_BOOKING_CUTOFF_MINUTES } from "@workshop/shared";
import { isRealDate } from "../common/zoned-time";

// FR-SCHED-01, FR-SCHED-02. Every text is trimmed; every instant carries its offset ("Z" or "+07:00") and is stored as UTC.
/** An instant with its offset, normalised to UTC ISO. A time without an offset is refused: it would be read in the time zone of the server. */
export const instant = z
  .string({ error: "dateInvalid" })
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), "dateInvalid")
  .transform((v) => new Date(v).toISOString());

const date = z.string({ error: "dateInvalid" }).trim().refine(isRealDate, "dateInvalid");
const cutoff = z.number({ error: "cutoffRange" }).int("cutoffRange").min(0, "cutoffRange").max(MAX_BOOKING_CUTOFF_MINUTES, "cutoffRange");
const capacity = z.number({ error: "capacityRange" }).int("capacityRange").min(1, "capacityRange").max(50, "capacityRange");
const imageUrl = z.string().trim().max(500, "tooLong").refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "urlInvalid");

export const sessionCreateSchema = z.object({
  workshopId: z.uuid({ error: "invalid" }),
  startsAt: instant,
  capacity: capacity.optional(),
  bookingCutoffMinutes: cutoff.optional(),
  imageUrl: imageUrl.optional(),
});

export const sessionUpdateSchema = z.object({ capacity: capacity.optional(), bookingCutoffMinutes: cutoff.optional(), imageUrl: imageUrl.optional() }).refine((v) => Object.keys(v).length > 0, { message: "empty" });

const reason = z.object({ code: z.string({ error: "required" }).trim().min(1, "required"), note: z.string().trim().max(CLOSE_REASON_NOTE_MAX, "tooLong").optional() }, { error: "required" });
export const sessionCloseSchema = z.object({ reason });
export const sessionRescheduleSchema = z.object({ newStartsAt: instant, reason });

export const sessionListQuery = z.object({
  workshopId: z.uuid().optional(),
  status: z.enum(["OPEN", "PAUSED", "RUNNING", "CLOSED", "COMPLETED"]).optional(),
  from: instant.optional(),
  to: instant.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});

const weekdays = z.array(z.number({ error: "invalid" }).int("invalid").min(0, "invalid").max(6, "invalid"), { error: "weekdaysRequired" }).min(1, "weekdaysRequired").max(7, "invalid").transform((l) => [...new Set(l)].sort());
const startTimes = z.array(z.string({ error: "invalid" }).trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "timeInvalid"), { error: "timesRequired" }).min(1, "timesRequired").max(12, "tooMany").transform((l) => [...new Set(l)].sort());

export const scheduleRuleSchema = z
  .object({
    weekdays, startTimes,
    effectiveFrom: date,
    effectiveTo: date.nullable().optional().transform((v) => v ?? null),
    capacityOverride: capacity.nullable().optional().transform((v) => v ?? null),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  })
  .superRefine((v, ctx) => {
    if (v.effectiveTo !== null && v.effectiveTo < v.effectiveFrom) ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "endBeforeStart" });
  });

export type ScheduleRuleInput = z.infer<typeof scheduleRuleSchema>;
