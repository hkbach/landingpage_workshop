import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { getPlatformSupport, setPlatformSupport } from "@/lib/mock/platform";
import { isValidSupportValue, SUPPORT_CHANNELS, type SupportChannel } from "@/lib/support-contact";

// The support contact of the PLATFORM (WhatsApp, phone, Zalo, email), shown to shop owners and customers, never on a landing page. SUPER_ADMIN only; TODO(api): check the role, `platform_settings`.
const headers = { "cache-control": "no-store" };
const text = z.string({ error: "invalid" }).trim().max(254, "tooLong");
const bodySchema = z.object({ whatsapp: text, phone: text, zalo: text, email: text });

/** GET -> { whatsapp, phone, zalo, email } ("" for a channel that is not set). */
export async function GET() {
  const c = getPlatformSupport();
  return Response.json({ whatsapp: c.whatsapp ?? "", phone: c.phone ?? "", zalo: c.zalo ?? "", email: c.email ?? "" }, { headers });
}

/** PUT { whatsapp, phone, zalo, email } -> 200 the saved values. An empty value clears the channel. 422 with `fields` ("invalid" | "tooLong") for a wrong number or email; nothing is saved then. */
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
  const bad = Object.fromEntries(SUPPORT_CHANNELS.filter((ch) => !isValidSupportValue(ch, parsed.data[ch])).map((ch) => [ch, "invalid"]));
  if (Object.keys(bad).length) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: bad }, headers);

  const before = getPlatformSupport();
  setPlatformSupport(parsed.data);
  const changed = SUPPORT_CHANNELS.filter((ch: SupportChannel) => (before[ch] ?? "") !== parsed.data[ch]);
  if (changed.length) recordAdminAction({ action: "platform.support_contact_update", entityType: "PlatformSettings", entityId: "support-contact", details: `changed: ${changed.join(", ")}` });
  const c = getPlatformSupport();
  return Response.json({ whatsapp: c.whatsapp ?? "", phone: c.phone ?? "", zalo: c.zalo ?? "", email: c.email ?? "" }, { headers });
}
