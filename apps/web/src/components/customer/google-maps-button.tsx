"use client";

import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * The Google Maps button of the guest area: an outline button with the location icon that opens `href` (already checked with safeMaps) in a new tab. It is the same
 * button as the one beside the Address box of the workshop form, on the tickets of My Booking and on the workshop cards of Workshops and Favorites.
 */
export function GoogleMapsButton({ href, testId }: { href: string; testId?: string }) {
  const t = useTranslations("customer.map");
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t("label")} data-testid={testId} className={buttonVariants({ variant: "outline" })}>
      <MapPin aria-hidden="true" />
      {t("name")}
    </a>
  );
}
