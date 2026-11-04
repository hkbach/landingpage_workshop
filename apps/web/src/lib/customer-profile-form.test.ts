import { describe, expect, it } from "vitest";
import type { CustomerProfile } from "./customer-api";
import { toDraft, toInput, trimDraft, validateDraft } from "./customer-profile-form";

const TODAY = "2026-11-10";
const profile: CustomerProfile = {
  id: "cu-1", fullName: "Emma Johnson", email: "emma@example.com", phone: "+44 7000 000000", preferredLocale: "en",
  account: { country: "GB", birthDate: "1990-04-12", gender: "FEMALE", socials: { INSTAGRAM: "@emma.makes" }, avatarUrl: "https://picsum.photos/seed/a/200/200" },
};

describe("the form of My Profile", () => {
  it("is filled in from the profile, with empty texts for what was never given", () => {
    const d = toDraft(profile);
    expect(d).toMatchObject({ fullName: "Emma Johnson", phone: "+44 7000 000000", country: "GB", birthDate: "1990-04-12", gender: "FEMALE" });
    expect(d.socials.INSTAGRAM).toBe("@emma.makes");
    expect(d.socials.ZALO).toBe("");
    const bare = toDraft({ ...profile, phone: undefined, account: { country: "VN", birthDate: "2000-01-01" } });
    expect(bare).toMatchObject({ phone: "", gender: "", avatarUrl: "" });
  });
  it("sends what the profile held, as it was", () => {
    expect(toInput(toDraft(profile))).toEqual({
      fullName: "Emma Johnson", phone: "+44 7000 000000", preferredLocale: "en", country: "GB", birthDate: "1990-04-12", gender: "FEMALE",
      socials: { INSTAGRAM: "@emma.makes" }, avatarUrl: "https://picsum.photos/seed/a/200/200",
    });
  });
  it("trims every text, and leaves out what is empty so it is removed", () => {
    const d = { ...toDraft(profile), fullName: "  Emma J  ", phone: "   ", gender: "" as const, avatarUrl: " ", socials: { ...toDraft(profile).socials, INSTAGRAM: "  ", ZALO: " 0901 " } };
    expect(trimDraft(d).fullName).toBe("Emma J");
    expect(toInput(d)).toEqual({ fullName: "Emma J", preferredLocale: "en", country: "GB", birthDate: "1990-04-12", socials: { ZALO: "0901" } });
  });
  it("is valid as the profile was, and says which field is wrong", () => {
    expect(validateDraft(toDraft(profile), TODAY)).toEqual({});
    const base = toDraft(profile);
    expect(validateDraft({ ...base, fullName: "   " }, TODAY)).toEqual({ fullName: "required" });
    expect(validateDraft({ ...base, fullName: "x".repeat(121) }, TODAY)).toEqual({ fullName: "tooLong" });
    expect(validateDraft({ ...base, phone: "1".repeat(41) }, TODAY)).toEqual({ phone: "tooLong" });
    expect(validateDraft({ ...base, country: "" }, TODAY)).toEqual({ country: "required" });
    expect(validateDraft({ ...base, country: "ZZ" }, TODAY)).toEqual({ country: "required" });
    expect(validateDraft({ ...base, birthDate: "" }, TODAY)).toEqual({ birthDate: "required" });
    expect(validateDraft({ ...base, birthDate: "2026-11-11" }, TODAY)).toEqual({ birthDate: "invalid" }); // not in the future
    expect(validateDraft({ ...base, birthDate: "1899-12-31" }, TODAY)).toEqual({ birthDate: "invalid" });
    expect(validateDraft({ ...base, birthDate: TODAY }, TODAY)).toEqual({});
    expect(validateDraft({ ...base, socials: { ...base.socials, X: "x".repeat(101) } }, TODAY)).toEqual({ socials: "tooLong" });
  });
  it("accepts only an https link for the picture", () => {
    const base = toDraft(profile);
    expect(validateDraft({ ...base, avatarUrl: "http://example.com/a.png" }, TODAY)).toEqual({ avatarUrl: "urlInvalid" });
    expect(validateDraft({ ...base, avatarUrl: "javascript:alert(1)" }, TODAY)).toEqual({ avatarUrl: "urlInvalid" });
    expect(validateDraft({ ...base, avatarUrl: "" }, TODAY)).toEqual({});
  });
});
