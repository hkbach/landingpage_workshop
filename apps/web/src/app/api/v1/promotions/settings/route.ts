import { z } from "zod";
import { STACKING_MODES } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { getStacking, setStacking } from "@/lib/mock/promotion-store";

// Promotion settings of the shop: how a guest may use promotions on one booking. MOCK implementation inside Next until apps/api exists.
// TODO(api): OWNER / MANAGER only, per organization_id, with an audit entry. Applies to bookings made after the change.

const settingsSchema = z.object({ stacking: z.enum(STACKING_MODES, { error: "required" }) });

export async function GET() {
  return Response.json({ stacking: getStacking() });
}

/** PUT { stacking: "SINGLE" | "MULTIPLE" } */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { stacking: "required" } });
  setStacking(parsed.data.stacking);
  return Response.json({ stacking: parsed.data.stacking });
}
