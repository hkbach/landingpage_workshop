"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Same key as the landing pages list of the admin area (components/admin/directory/landing-pages-admin.tsx); not imported so the owner area does not load admin code.
const ADMIN_MODE_KEY = "wk:admin-mode";
const subscribe = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };
const read = (): string => { try { return window.sessionStorage.getItem(ADMIN_MODE_KEY) ?? ""; } catch { return ""; } };

/**
 * Shown on every page of the shop owner area while a system administrator is editing the shop (they came from Landing pages of the admin area): it says whose changes these
 * are, and leads back to the admin area, which also ends the admin mode.
 */
export function AdminModeBanner({ slug }: { slug: string }) {
  const t = useTranslations("dashboard.adminMode");
  const mode = useSyncExternalStore(subscribe, read, () => "");
  if (mode !== slug) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950" data-testid="admin-mode-banner">
      <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden />{t("text")}</span>
      <Link href="/systemadmin/landing-pages" className={buttonVariants({ size: "sm", variant: "outline" })} onClick={() => { try { window.sessionStorage.removeItem(ADMIN_MODE_KEY); } catch { /* nothing to clear */ } }}>{t("back")}</Link>
    </div>
  );
}
