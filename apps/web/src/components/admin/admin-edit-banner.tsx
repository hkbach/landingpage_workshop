"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_REASON_COOKIE, MAX_ADMIN_REASON } from "@/lib/admin-edit-reason";

const BACK = { site: "landing-pages", sessions: "sessions", workshops: "workshops" } as const;

/** The reason travels in a cookie the shared routes read (see lib/mock/admin-edit.ts); it lasts as long as the tab session. */
function keepReason(reason: string): void {
  const value = reason.trim();
  document.cookie = value ? `${ADMIN_REASON_COOKIE}=${encodeURIComponent(value)}; path=/; SameSite=Lax` : `${ADMIN_REASON_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * On every page where an administrator edits a shop: whose shop it is, that the changes are recorded as made by an administrator, the way back to the list it came from, and the REASON of the changes
 * (required: the server refuses a change without it, and the shop owner is told by email what changed and why).
 */
export function AdminEditBanner({ shopName, slug }: { shopName: string; slug: string }) {
  const t = useTranslations("admin.editAs");
  const section = (usePathname() ?? "").split("/").filter(Boolean)[3] as keyof typeof BACK | undefined;
  const key = section && section in BACK ? section : "site";
  const [reason, setReason] = useState("");
  // A reason typed earlier belongs to an earlier visit: start empty, and forget it when the administrator leaves the shop.
  useEffect(() => {
    keepReason("");
    return () => keepReason("");
  }, []);
  return (
    <div role="status" className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="admin-edit-banner" data-slug={slug}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" aria-hidden />{t("text", { shop: shopName })}</span>
        <Link href={`/systemadmin/${BACK[key]}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{t(`back.${key}`)}</Link>
      </div>
      <label className="grid gap-1" htmlFor="admin-edit-reason">
        <span className="font-medium">{t("reasonLabel")}</span>
        <Input
          id="admin-edit-reason" value={reason} maxLength={MAX_ADMIN_REASON} placeholder={t("reasonPlaceholder")} autoComplete="off" data-testid="admin-edit-reason"
          onChange={(e) => { setReason(e.target.value); keepReason(e.target.value); }} className="bg-white"
        />
        <span className="text-xs">{reason.trim() ? t("reasonSet") : t("reasonHint")}</span>
      </label>
    </div>
  );
}
