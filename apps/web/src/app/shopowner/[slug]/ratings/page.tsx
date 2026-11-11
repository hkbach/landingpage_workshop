import { RatingsView } from "@/components/ratings/ratings-view";

// The ratings and comments of the guests (read only). They come from /api/v1/ratings (see lib/mock/rating-store.ts).
export default function RatingsPage() {
  return <RatingsView />;
}
