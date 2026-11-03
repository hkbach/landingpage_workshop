import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FEE_RATES } from "@workshop/shared";
import { getFeeRates, resetFeeRates } from "@/lib/mock/fee-rates-store";
import { GET, PUT } from "./admin/finance-settings/route";

const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const fields = async (res: Response) => ((await res.json()) as { error: { details: { fields: Record<string, string> } } }).error.details.fields;

beforeEach(resetFeeRates);

describe("/admin/finance-settings", () => {
  it("starts with the default rates", async () => {
    expect(await (await GET()).json()).toEqual(DEFAULT_FEE_RATES);
  });
  it("saves both rates, and the shops read the new ones", async () => {
    const res = await put({ maintenanceBps: 250, serviceBps: 1000 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ maintenanceBps: 250, serviceBps: 1000 });
    expect(getFeeRates()).toEqual({ maintenanceBps: 250, serviceBps: 1000 });
  });
  it("accepts 0% for both", async () => {
    expect((await put({ maintenanceBps: 0, serviceBps: 0 })).status).toBe(200);
  });
  it("refuses a rate below 0, above 100%, or with a fraction of a basis point, and keeps the old rates", async () => {
    expect(await fields(await put({ maintenanceBps: -1, serviceBps: 0 }))).toEqual({ maintenanceBps: "invalid" });
    expect(await fields(await put({ maintenanceBps: 0, serviceBps: 10_001 }))).toEqual({ serviceBps: "invalid" });
    expect((await put({ maintenanceBps: 1.5, serviceBps: 0 })).status).toBe(422);
    expect(getFeeRates()).toEqual(DEFAULT_FEE_RATES);
  });
  it("refuses two fees that together take more than 100%", async () => {
    const res = await put({ maintenanceBps: 6000, serviceBps: 4001 });
    expect(res.status).toBe(422);
    expect(await fields(res)).toEqual({ serviceBps: "totalTooHigh" });
    expect(getFeeRates()).toEqual(DEFAULT_FEE_RATES);
  });
  it("refuses a missing or wrong body", async () => {
    expect((await put({ maintenanceBps: "2" })).status).toBe(422);
    expect((await PUT(new Request("http://x", { method: "PUT", body: "nope" }))).status).toBe(400);
  });
});
