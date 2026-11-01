"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";
import type { Shop } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ReviewDecision } from "./review-decision";
import { StatusBadge } from "./status-badge";
import { fmt, previewHref } from "./utils";

const CHECKLIST = ["identity", "contact", "content", "workshops", "languages"] as const;

export function ReviewDetail({ shop, workshops }: { shop: Shop; workshops: number }) {
  const t = useTranslations("admin.reviewDetail");
  const tr = useTranslations("admin.reviews");
  const tc = useTranslations("admin.common");
  const ts = useTranslations("admin.status");
  const locale = useLocale();
  const uid = useId();
  const [status, setStatus] = useState<OrgStatus>(shop.status);
  const [message, setMessage] = useState("");

  const pending = status === "PENDING_REVIEW";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("summary")} <StatusBadge status={status} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("name")}</dt>
              <dd className="font-medium">{shop.name}</dd>
              <dt className="text-muted-foreground">{t("slug")}</dt>
              <dd className="font-mono">{shop.slug}</dd>
              <dt className="text-muted-foreground">{t("owner")}</dt>
              <dd>
                {shop.ownerName} ({shop.ownerEmail})
              </dd>
              <dt className="text-muted-foreground">{t("contact")}</dt>
              <dd>
                {shop.contactEmail} · {shop.contactPhone}
              </dd>
              <dt className="text-muted-foreground">{t("address")}</dt>
              <dd>{shop.address}</dd>
              <dt className="text-muted-foreground">{t("languages")}</dt>
              <dd>
                {shop.enabledLocales.map((l) => l.toUpperCase()).join(", ")} ({t("defaultLanguage")}:{" "}
                {shop.defaultLocale.toUpperCase()})
              </dd>
              <dt className="text-muted-foreground">{t("workshops")}</dt>
              <dd>{workshops}</dd>
              <dt className="text-muted-foreground">{t("created")}</dt>
              <dd>
                {fmt(shop.createdAt, locale)} <span className="text-xs text-muted-foreground">({tc("utcNote")})</span>
              </dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("checklistTitle")}</CardTitle>
            <CardDescription>{t("checklistHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {CHECKLIST.map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <Checkbox id={`${uid}-${key}`} className="mt-0.5" />
                  <Label htmlFor={`${uid}-${key}`} className="font-normal leading-snug">
                    {t(`checklist.${key}`)}
                  </Label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("previewTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div
              role="img"
              aria-label={t("previewBody")}
              className="flex min-h-56 items-center justify-center rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground"
            >
              {t("previewBody")}
            </div>
            <Link
              href={previewHref()}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", className: "w-fit" })}
            >
              <ExternalLink aria-hidden /> {t("previewLink")}
              <span className="sr-only">{tc("opensNewTab")}</span>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("decisionTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p role="status" className="text-sm font-medium text-emerald-800">
              {message}
            </p>
            {pending ? (
              <div className="flex flex-wrap gap-2">
                <ReviewDecision
                  shopName={shop.name}
                  onApprove={() => {
                    setStatus("ACTIVE");
                    setMessage(tr("approved", { name: shop.name }));
                  }}
                  onReject={() => {
                    setStatus("DRAFT");
                    setMessage(tr("rejected", { name: shop.name }));
                  }}
                />
              </div>
            ) : (
              <>
                {!message && (
                  <p className="text-sm text-muted-foreground">
                    {t("notPendingBody", { status: ts(status) })}
                  </p>
                )}
                <Link href="/systemadmin/reviews" className={buttonVariants({ variant: "secondary", className: "w-fit" })}>
                  {t("backToQueue")}
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
