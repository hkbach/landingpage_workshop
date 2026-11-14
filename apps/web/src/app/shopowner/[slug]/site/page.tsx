import { notFound } from "next/navigation";
import { LandingPagesView } from "@/components/builder/site-views";
import { loadOwnShop } from "@/lib/own-shop";

// The shop owner's landing pages (up to MAX_LANDING_PAGES_PER_SHOP, one public at a time). Each is edited at /shopowner/{slug}/site/{pageId}.
export default async function LandingPagesPage() {
  const shop = await loadOwnShop();
  if (!shop) notFound();
  return <LandingPagesView shop={shop} />;
}
