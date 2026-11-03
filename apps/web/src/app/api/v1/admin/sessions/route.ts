import { closeIfEnded } from "@workshop/shared";
import { sessions } from "@/lib/mock/data";
import { withAdminChanges } from "@/lib/mock/session-admin-store";

// The sessions of the demo shop as the system admin sees them (SUPER_ADMIN only; TODO(api): per organization, from the database).
export async function GET() {
  const now = new Date();
  return Response.json({ items: withAdminChanges(sessions).map((s) => closeIfEnded(s, now)) }, { headers: { "cache-control": "no-store" } });
}
