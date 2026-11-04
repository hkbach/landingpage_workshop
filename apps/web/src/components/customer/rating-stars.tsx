"use client";

import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const STARS = [0, 1, 2, 3, 4];
const row = (className: string) => (
  <span className={cn("flex w-max", className)}>
    {STARS.map((i) => <Star key={i} className="size-4 shrink-0 fill-current" aria-hidden="true" />)}
  </span>
);

/** The stars a rating is shown with: from 1 to 5, the part of a star that is filled follows the average (4.5 fills four and a half). */
export function starsFilled(average: number): number {
  return Math.min(5, Math.max(1, Number.isFinite(average) ? average : 1));
}

/** The rating of a workshop: five stars filled up to the average, the average itself and how many ratings it comes from. */
export function RatingStars({ average, count }: { average: number; count: number }) {
  const t = useTranslations("customer.workshops");
  const value = starsFilled(average);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" role="img" aria-label={t("ratingLabel", { average: value.toFixed(1), count })} data-testid="customer-workshop-rating" data-rating={value.toFixed(1)}>
      <span className="relative inline-flex" aria-hidden="true">
        {row("text-black/20")}
        <span className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${(value / 5) * 100}%` }} data-testid="customer-workshop-stars-fill">{row("text-amber-500")}</span>
      </span>
      <span className="font-medium text-[var(--site-text)]" aria-hidden="true">{value.toFixed(1)}</span>
      <span className="text-[var(--site-muted)]" aria-hidden="true">({count})</span>
    </span>
  );
}
