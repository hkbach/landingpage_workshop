import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

type Role = "SUPER_ADMIN" | "SHOP_OWNER" | "ANONYMOUS";

/** Mock role of the current user. Replaced by the real session role once auth exists. */
const MOCK_ROLE: Role = "SUPER_ADMIN";

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("admin.guard");

  if (MOCK_ROLE !== "SUPER_ADMIN") {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">{t("deniedTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("deniedBody")}</p>
        <Link href="/login" className={buttonVariants({ className: "mt-4" })}>
          {t("toLogin")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        {t("mockNotice")}
      </p>
      {children}
    </>
  );
}
