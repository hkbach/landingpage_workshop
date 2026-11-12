import { z } from "zod";
import { LOCALES, WORKSHOP_ADDRESS_MAX, WORKSHOP_ADDRESS_NOTE_MAX, WORKSHOP_CATEGORIES } from "@workshop/shared";

// FR-WS-01. Every text is trimmed (BR-16); an empty text of a language means "not written" and is dropped. The codes of the errors are the ones the form already shows.
const locale = z.enum(LOCALES);
const text = (max: number) => z.string({ error: "invalid" }).trim().max(max, "tooLong");
const dropEmpty = <T extends Record<string, unknown>>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== ""))) as T;
const localized = (max: number) => z.partialRecord(locale, text(max)).transform(dropEmpty);
const httpsUrl = z.string({ error: "invalid" }).trim().max(500, "tooLong").refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "urlInvalid");

export const MAX_PRICE_MINOR = 1_000_000_000_000; // far below 2^53, so a bigint column read as a number is exact

export const workshopInputSchema = z
  .object({
    title: localized(120),
    shortDescription: localized(200).default({}),
    description: localized(5000).default({}),
    includes: z.partialRecord(locale, z.array(text(200)).max(20, "tooMany").transform((l) => l.filter((x) => x !== ""))).transform(dropEmpty).default({}),
    notes: localized(2000).default({}),
    durationMinutes: z.number({ error: "durationRange" }).int("durationRange").min(15, "durationRange").max(600, "durationRange"),
    priceAmount: z.number({ error: "priceInvalid" }).int("priceInvalid").min(0, "priceInvalid").max(MAX_PRICE_MINOR, "priceInvalid"),
    defaultCapacity: z.number({ error: "capacityRange" }).int("capacityRange").min(1, "capacityRange").max(50, "capacityRange"),
    maxPerBooking: z.number({ error: "maxPerBookingRange" }).int("maxPerBookingRange").min(1, "maxPerBookingRange").default(6),
    coverUrl: httpsUrl.default(""),
    galleryUrls: z.array(httpsUrl, { error: "invalid" }).max(6, "galleryMax").transform((l) => l.filter((x) => x !== "")).default([]),
    categories: z.array(z.enum(WORKSHOP_CATEGORIES, { error: "categoriesRequired" }), { error: "categoriesRequired" }).min(1, "categoriesRequired").max(3, "categoriesRequired").transform((l) => [...new Set(l)]),
    address: text(WORKSHOP_ADDRESS_MAX).default(""),
    addressNote: text(WORKSHOP_ADDRESS_NOTE_MAX).default(""),
    sortOrder: z.number({ error: "sortInvalid" }).int("sortInvalid").min(-1_000_000).max(1_000_000).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.maxPerBooking > v.defaultCapacity) ctx.addIssue({ code: "custom", path: ["maxPerBooking"], message: "maxPerBookingRange" });
  });

export type WorkshopInput = z.infer<typeof workshopInputSchema>;

export const workshopStatusSchema = z.object({ status: z.enum(["ACTIVE", "DRAFT"], { error: "invalid" }) });

export const workshopListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "DRAFT"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});
