"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const BACK = { site: "landing-pages", sessions: "sessions", workshops: "workshops" } as const;

/** On every page where an administrator edits a shop: whose shop it is, that the changes are recorded as made by an administrator, and the way back to the list it came from. */
export function AdminEditBanner({ shopName, slug }: { shopName: string; slug: string }) {
  const t = useTranslations("admin.editAs");
  const section = (usePathname() ?? "").split("/").filter(Boolean)[3] as keyof typeof BACK | undefined;
  const key = section && section in BACK ? section : "site";
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="admin-edit-banner" data-slug={slug}>
      <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 shrink-0" aria-hidden />{t("text", { shop: shopName })}</span>
      <Link href={`/systemadmin/${BACK[key]}`} className={buttonVariants({ size: "sm", variant: "outline" })}>{t(`back.${key}`)}</Link>
    </div>
  );
}
