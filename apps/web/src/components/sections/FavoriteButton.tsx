"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useFavorites } from "./favorites-context";

/** The heart of a workshop card: saves the workshop to the favorites of the guest (the guest logs in first). Nothing where favorites are not offered. */
export function FavoriteButton({ workshopId, title, className }: { workshopId: string; title: string; className?: string }) {
  const t = useTranslations("site.favorites");
  const { enabled, isFavorite, toggle } = useFavorites();
  if (!enabled) return null;
  const on = isFavorite(workshopId);
  return (
    <button
      type="button" aria-pressed={on} aria-label={t(on ? "remove" : "add", { title })} title={t(on ? "remove" : "add", { title })}
      data-testid="favorite-button" onClick={() => toggle(workshopId)}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-white/90 text-[var(--site-primary)] shadow-sm outline-none ring-1 ring-black/10 transition hover:bg-white focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40",
        className,
      )}
    >
      <Heart className={cn("size-5", on && "fill-current")} aria-hidden />
    </button>
  );
}
