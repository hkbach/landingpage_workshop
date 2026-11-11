"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { OwnerRating } from "@/lib/mock/rating-store";

interface RatingsResponse { items: OwnerRating[]; average: number; count: number }

/** The ratings and comments guests left for the workshops of the shop (read only). An administrator can remove a rating that breaks the rules; it then disappears from here. */
export function RatingsView() {
  const t = useTranslations("ratings");
  const locale = useLocale();
  const { data, isError, isPending } = useQuery({
    queryKey: ["ratings"],
    queryFn: async (): Promise<RatingsResponse> => {
      const res = await fetch("/api/v1/ratings", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return (await res.json()) as RatingsResponse;
    },
  });
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  return (
    <div className="grid gap-4" data-testid="ratings-view">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      {isError ? <p role="alert" className="text-sm text-destructive">{t("failed")}</p> : null}
      {isPending ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
      {data ? (
        <>
          <p className="text-sm" data-testid="ratings-summary">{data.count ? t("summary", { average: data.average, count: data.count }) : t("empty")}</p>
          <ul className="grid gap-3">
            {data.items.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="grid gap-1 py-3" data-testid="rating-item">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{r.workshopTitle}</span>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-700" aria-label={t("starsOf", { n: r.stars })}>
                        <span className="inline-flex" aria-hidden>{[1, 2, 3, 4, 5].map((i) => <Star key={i} className={i <= r.stars ? "size-4 fill-amber-500 text-amber-500" : "size-4 text-black/20"} />)}</span>
                        {r.stars}/5
                      </span>
                    </div>
                    {r.comment ? <p className="whitespace-pre-wrap break-words text-sm">{r.comment}</p> : <p className="text-sm text-muted-foreground">{t("noComment")}</p>}
                    <p className="text-xs text-muted-foreground">{r.guestName ? `${r.guestName} · ` : ""}{r.bookingCode} · {date(r.createdAt)}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
