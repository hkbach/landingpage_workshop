import type { PromotionInput, PromotionRecord, StackingMode } from "@workshop/shared";

// Browser side of the shop owner promotion endpoints (/api/v1/promotions).

export class PromotionApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly fields: Record<string, string> = {}, readonly details: Record<string, unknown> = {}) {
    super(code);
    this.name = "PromotionApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; details?: Record<string, unknown> & { fields?: Record<string, string> } } } | null;
    throw new PromotionApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.details?.fields ?? {}, body?.error?.details ?? {});
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface PromotionsResponse {
  items: PromotionRecord[];
  /** Today in the shop timezone ("YYYY-MM-DD"): the status of a promotion depends on it, so the server says what day it is. */
  today: string;
  limit: number;
  /** Most promotions that may run at the same time. */
  maxConcurrent: number;
  /** How a guest may use promotions on one booking. */
  stacking: StackingMode;
}

const JSON_HEADERS = { "content-type": "application/json" };

export const fetchPromotions = async (): Promise<PromotionsResponse> => parse(await fetch("/api/v1/promotions", { cache: "no-store" }));

export const savePromotionRequest = async (id: string | null, input: PromotionInput): Promise<PromotionRecord> =>
  parse(await fetch(id ? `/api/v1/promotions/${encodeURIComponent(id)}` : "/api/v1/promotions", { method: id ? "PUT" : "POST", headers: JSON_HEADERS, body: JSON.stringify(input) }));

export const setPromotionEnabledRequest = async (id: string, enabled: boolean): Promise<PromotionRecord> =>
  parse(await fetch(`/api/v1/promotions/${encodeURIComponent(id)}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ enabled }) }));

export const deletePromotionRequest = async (id: string): Promise<void> =>
  parse(await fetch(`/api/v1/promotions/${encodeURIComponent(id)}`, { method: "DELETE" }));

export const saveStackingRequest = async (stacking: StackingMode): Promise<{ stacking: StackingMode }> =>
  parse(await fetch("/api/v1/promotions/settings", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ stacking }) }));
