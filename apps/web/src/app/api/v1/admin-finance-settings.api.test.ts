import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FEE_RATES } from "@workshop/shared";
import { currentShop, shops } from "@/lib/mock/data";
import { getFeeRates, resetFeeRates } from "@/lib/mock/fee-rates-store";
import { GET, PUT } from "./admin/organizations/[id]/finance-settings/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const put = (id: string, body: unknown) => PUT(new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));
const get = (id: string) => GET(new Request("http://x"), ctx(id));
const fields = async (res: Response) => ((await res.json()) as { error: { details: { fields: Record<string, string> } } }).error.details.fields;

const A = currentShop.id;
const B = shops.find((s) => s.id !== A)!.id;

beforeEach(resetFeeRates);

describe("/admin/organizations/{id}/finance-settings", () => {
  it("every shop starts with the default rates", async () => {
    expect(await (await get(A)).json()).toEqual(DEFAULT_FEE_RATES);
    expect(await (await get(B)).json()).toEqual(DEFAULT_FEE_RATES);
  });
  it("saves the rates of one shop only: the other shops keep theirs", async () => {
    const res = await put(A, { maintenanceBps: 250, serviceBps: 1000 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maintenanceBps: 250, serviceBps: 1000 });
    expect(getFeeRates(A)).toEqual({ maintenanceBps: 250, serviceBps: 1000 });
    expect(getFeeRates(B)).toEqual(DEFAULT_FEE_RATES);
    await put(B, { maintenanceBps: 0, serviceBps: 500 });
    expect(getFeeRates(A)).toEqual({ maintenanceBps: 250, serviceBps: 1000 });
    expect(getFeeRates(B)).toEqual({ maintenanceBps: 0, serviceBps: 500 });
  });
  it("accepts 0% for both", async () => {
    expect((await put(A, { maintenanceBps: 0, serviceBps: 0 })).status).toBe(200);
  });
  it("refuses a rate below 0, above 100%, or with a fraction of a basis point, and keeps the old rates", async () => {
    expect(await fields(await put(A, { maintenanceBps: -1, serviceBps: 0 }))).toEqual({ maintenanceBps: "invalid" });
    expect(await fields(await put(A, { maintenanceBps: 0, serviceBps: 10_001 }))).toEqual({ serviceBps: "invalid" });
    expect((await put(A, { maintenanceBps: 1.5, serviceBps: 0 })).status).toBe(422);
    expect(getFeeRates(A)).toEqual(DEFAULT_FEE_RATES);
  });
  it("refuses two fees that together take more than 100%", async () => {
    const res = await put(A, { maintenanceBps: 6000, serviceBps: 4001 });
    expect(res.status).toBe(422);
    expect(await fields(res)).toEqual({ serviceBps: "totalTooHigh" });
    expect(getFeeRates(A)).toEqual(DEFAULT_FEE_RATES);
  });
  it("refuses a missing or wrong body, and a shop that does not exist", async () => {
    expect((await put(A, { maintenanceBps: "2" })).status).toBe(422);
    expect((await PUT(new Request("http://x", { method: "PUT", body: "nope" }), ctx(A))).status).toBe(400);
    expect((await put("org-nope", { maintenanceBps: 1, serviceBps: 1 })).status).toBe(404);
    expect((await get("org-nope")).status).toBe(404);
  });
});
