import { type PromotionRecord } from "@workshop/shared";
import { apiGet, realApi } from "@/lib/api-server";
import { dayKey } from "@/lib/format";
import { fetchAll } from "@/lib/shop-data";
import type { ScheduleRule } from "@/lib/mock/ops";
import type { Workshop } from "@/lib/types";

// The catalog of the shop of the session, from the API, in the shapes the owner pages already use. (Only called when connected to the API.)

/** A workshop as the API gives it: the same fields as the page model, plus how many of its sessions are open and how many there are. */
export type OwnWorkshop = Workshop & { sessions: { open: number; total: number } };

export const ownWorkshops = (): Promise<OwnWorkshop[]> => fetchAll<OwnWorkshop>("/workshops");

type ApiRule = { id: string; workshopId: string; weekdays: number[]; startTimes: string[]; effectiveFrom: string; effectiveTo: string | null; capacityOverride: number | null; status: "ACTIVE" | "INACTIVE" };

/** The schedule rules of a workshop in the shape of the editor. */
export async function ownScheduleRules(workshopId: string): Promise<ScheduleRule[]> {
  const res = await apiGet<{ items: ApiRule[] }>(`/workshops/${workshopId}/schedule-rules`);
  return (res?.items ?? []).map((r) => ({
    id: r.id, workshopId: r.workshopId, weekdays: r.weekdays, times: r.startTimes, effectiveFrom: r.effectiveFrom, ...(r.effectiveTo ? { effectiveTo: r.effectiveTo } : {}),
    ...(r.capacityOverride !== null ? { capacityOverride: r.capacityOverride } : {}), status: r.status === "ACTIVE" ? "ACTIVE" : "PAUSED",
  }));
}

/** All the promotions of the shop and "today" in the time zone of the shop. */
export async function ownPromotions(timezone: string): Promise<{ promotions: PromotionRecord[]; today: string }> {
  const res = await apiGet<{ items: PromotionRecord[]; today?: string }>("/promotions");
  return { promotions: res?.items ?? [], today: res?.today ?? dayKey(new Date().toISOString(), timezone) };
}

export const connected = realApi;
