import { afterEach, describe, expect, it } from "vitest";
import { bookingCutoffMinutes, resetShopSettingsStore } from "@/lib/mock/shop-settings-store";
import { GET, PATCH } from "./settings/booking/route";

const patch = (body: unknown) => PATCH(new Request("http://x/api/v1/settings/booking", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

afterEach(() => resetShopSettingsStore());

describe("booking cut-off setting", () => {
  it("starts at the demo shop's value, and the saved value is what the public pages read", async () => {
    expect(bookingCutoffMinutes()).toBe(120);
    expect((await patch({ bookingCutoffMinutes: 360 })).status).toBe(200);
    expect(bookingCutoffMinutes()).toBe(360);
    expect(((await (await GET()).json()) as { bookingCutoffMinutes: number }).bookingCutoffMinutes).toBe(360);
  });
  it("0 is allowed (booking closes when the session starts), a week is the most", async () => {
    expect((await patch({ bookingCutoffMinutes: 0 })).status).toBe(200);
    expect((await patch({ bookingCutoffMinutes: 10_080 })).status).toBe(200);
  });
  it("refuses a value that is not a whole number from 0 to 10080 and keeps the old one", async () => {
    for (const bad of [-1, 10_081, 1.5, "60", null]) {
      const res = await patch({ bookingCutoffMinutes: bad });
      expect(res.status, String(bad)).toBe(422);
      expect(((await res.json()) as { error: { details: { fields: Record<string, string> } } }).error.details.fields).toEqual({ bookingCutoffMinutes: "cutoffInvalid" });
    }
    expect(bookingCutoffMinutes()).toBe(120);
  });
});
