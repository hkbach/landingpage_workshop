import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { currentShop } from "@/lib/mock/data";
import { checkPlatformSettings, DEFAULT_PLATFORM_SETTINGS, getPlatformSettings, setPlatformSettings, SETTING_BOUNDS } from "@/lib/mock/app-settings-store";

// The settings of the whole platform: the smallest and the largest amount of one withdrawal (minor units of the currency of the platform, 0 = no limit), the hours the link of a password reset
// works (24 by default) and the messages one visitor can send with the Contact form in an hour (5 by default). SUPER_ADMIN only; MOCK implementation inside Next until apps/api exists.
const headers = { "cache-control": "no-store" };
const num = z.number({ error: "invalid" }).int("invalid");
const bodySchema = z.object({ withdrawalMin: num, withdrawalMax: num, resetLinkHours: num, contactPerHour: num });

const view = () => ({ ...getPlatformSettings(), currency: currentShop.currency, defaults: DEFAULT_PLATFORM_SETTINGS, bounds: SETTING_BOUNDS });

/** GET -> { withdrawalMin, withdrawalMax, resetLinkHours, contactPerHour, currency, defaults, bounds }. */
export async function GET() {
  return Response.json(view(), { headers });
}

/** PUT the four values -> 200 the settings. 422 `fields` ("invalid" | "order") and nothing is saved. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields }, headers);
  }
  const check = checkPlatformSettings(parsed.data);
  if (check !== "OK") {
    const fields = check === "WITHDRAWAL_ORDER" ? { withdrawalMax: "order" } : check === "WITHDRAWAL_INVALID" ? { withdrawalMin: "invalid", withdrawalMax: "invalid" } : check === "RESET_INVALID" ? { resetLinkHours: "invalid" } : { contactPerHour: "invalid" };
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields }, headers);
  }
  const before = getPlatformSettings();
  setPlatformSettings(parsed.data);
  const changed = (Object.keys(parsed.data) as (keyof typeof parsed.data)[]).filter((k) => before[k] !== parsed.data[k]);
  if (changed.length) recordAdminAction({ action: "platform.settings_update", entityType: "PlatformSettings", entityId: "settings", details: changed.map((k) => `${k} ${before[k]} -> ${parsed.data[k]}`).join("; ") });
  return Response.json(view(), { headers });
}
