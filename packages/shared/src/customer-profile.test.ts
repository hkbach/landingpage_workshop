import { describe, expect, it } from "vitest";
import { GENDERS, SOCIAL_PLATFORMS, socialEntries } from "./customer-profile";

describe("customer profile", () => {
  it("lists the genders and the social platforms", () => {
    expect([...GENDERS]).toEqual(["MALE", "FEMALE", "OTHER"]);
    expect(new Set(SOCIAL_PLATFORMS).size).toBe(SOCIAL_PLATFORMS.length);
    for (const p of ["ZALO", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "LINE", "KAKAOTALK", "WECHAT", "TELEGRAM", "X"]) expect(SOCIAL_PLATFORMS).toContain(p);
  });
  it("gives the accounts that were given, in the order of the platforms, trimmed", () => {
    expect(socialEntries({ INSTAGRAM: " @emma ", ZALO: "0901", FACEBOOK: "emma.j" })).toEqual([["ZALO", "0901"], ["FACEBOOK", "emma.j"], ["INSTAGRAM", "@emma"]]);
  });
  it("leaves out empty and blank handles, and gives nothing when nothing was given", () => {
    expect(socialEntries({ ZALO: "", LINE: "   " })).toEqual([]);
    expect(socialEntries({})).toEqual([]);
    expect(socialEntries(undefined)).toEqual([]);
  });
});
