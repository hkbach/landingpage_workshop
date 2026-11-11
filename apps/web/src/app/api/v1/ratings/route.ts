import { listAccounts } from "@/lib/mock/accounts-store";
import { workshops } from "@/lib/mock/data";
import { listRatings, type OwnerRating } from "@/lib/mock/rating-store";

// The ratings guests gave to the workshops of the signed-in shop (shop owner): the stars and the comments, newest first. A rating an administrator removed is not here. MOCK implementation inside Next until apps/api exists.
// TODO(api): require an OWNER / MANAGER session and filter by organization_id from it.

/** GET /api/v1/ratings -> 200 { items, average, count }: `average` (one decimal) and `count` are of the ratings shown. */
export async function GET() {
  const accounts = listAccounts();
  const items: OwnerRating[] = listRatings()
    .filter((r) => !r.removedAt)
    .map((r) => {
      const w = workshops.find((x) => x.id === r.workshopId);
      return { id: r.id, bookingCode: r.bookingCode, workshopId: r.workshopId, workshopTitle: w ? (w.title.en ?? Object.values(w.title).find(Boolean) ?? r.workshopId) : r.workshopId, guestName: accounts.find((a) => a.id === r.customerId)?.fullName ?? "", stars: r.stars, comment: r.comment, createdAt: r.createdAt };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const count = items.length;
  const average = count ? Math.round((items.reduce((n, r) => n + r.stars, 0) / count) * 10) / 10 : 0;
  return Response.json({ items, average, count }, { headers: { "cache-control": "no-store" } });
}
