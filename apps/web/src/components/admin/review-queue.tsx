"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { Shop } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReviewDecision } from "./review-decision";
import { fmt, previewHref } from "./utils";

export function ReviewQueue({ initial }: { initial: Shop[] }) {
  const t = useTranslations("admin.reviews");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const [queue, setQueue] = useState(initial);
  const [message, setMessage] = useState("");

  function decide(shop: Shop, kind: "approved" | "rejected") {
    // Simulated: remove from the queue only; nothing is persisted.
    setQueue((q) => q.filter((s) => s.id !== shop.id));
    setMessage(t(kind, { name: shop.name }));
  }

  return (
    <div className="grid gap-3">
      <p role="status" className="min-h-5 text-sm font-medium text-emerald-800">
        {message}
      </p>

      {queue.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3">
          {queue.map((shop) => (
            <li key={shop.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{shop.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {shop.ownerName} · {shop.ownerEmail}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("submitted", { date: fmt(shop.createdAt, locale) })} · {tc("utcNote")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={previewHref()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <ExternalLink aria-hidden /> {t("preview")}
                      <span className="sr-only">
                        {shop.name} {tc("opensNewTab")}
                      </span>
                    </Link>
                    <Link href={`/admin/reviews/${shop.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                      {t("review")}
                      <span className="sr-only">: {shop.name}</span>
                    </Link>
                    <ReviewDecision
                      size="sm"
                      shopName={shop.name}
                      onApprove={() => decide(shop, "approved")}
                      onReject={() => decide(shop, "rejected")}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
