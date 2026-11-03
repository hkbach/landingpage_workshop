import { apiError } from "@/lib/api-error";
import { getImage } from "@/lib/mock/media-store";

// Serves an uploaded session image to everyone (it is shown on the public landing page). Only validated images are ever stored.

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/media/sessions/[id]">) {
  const { id } = await ctx.params;
  const image = getImage(id);
  if (!image) return apiError(404, "NOT_FOUND", "Image not found.");
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.length),
      // The id is random and never reused, so the bytes behind it never change.
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
