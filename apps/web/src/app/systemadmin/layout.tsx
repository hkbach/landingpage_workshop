import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LogOut, ShieldCheck } from "lucide-react";
import { LogoutLink } from "@/components/auth/logout-link";
import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminNav } from "@/components/admin/admin-nav";
import { buttonVariants } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/dashboard/shell/locale-switcher";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { ADMIN_LOCALES } from "@workshop/shared";
import { requireArea } from "@/lib/api-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminLayout({ children }: LayoutProps<"/systemadmin">) {
  await requireArea("SUPER_ADMIN"); // connected to the API: only the platform administrator, with a session
  const t = await getTranslations("admin.shell");

  return (
    <AreaIntlProvider area="admin">
      <div className="flex min-h-screen flex-col bg-muted/30 md:flex-row">
        <a
          href="#admin-main"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
        >
          {t("skip")}
        </a>

        <aside className="border-b bg-background md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-b-0 xl:w-72">
          <div className="flex flex-col gap-3 p-3 md:h-full md:gap-5 md:p-4">
            <div className="flex items-center justify-between gap-2 md:block">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" aria-hidden />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">{t("identity")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("brand")} · {t("role")}
                  </p>
                </div>
              </div>
              <LogoutLink className={buttonVariants({ variant: "outline", size: "sm", className: "md:hidden" })}>
                <LogOut aria-hidden /> {t("logout")}
              </LogoutLink>
            </div>
            <LocaleSwitcher locales={ADMIN_LOCALES} labelKey="admin.shell.language" />
            <AdminNav />
            <LogoutLink className={buttonVariants({ variant: "outline", size: "sm", className: "hidden w-full md:inline-flex" })}>
              <LogOut aria-hidden /> {t("logout")}
            </LogoutLink>
          </div>
        </aside>

        <main id="admin-main" className="min-w-0 flex-1 p-4 md:p-6 xl:p-8 2xl:px-12">
          <div className="mx-auto max-w-[1600px]">
            <AdminGuard>{children}</AdminGuard>
          </div>
        </main>
      </div>
    </AreaIntlProvider>
  );
}
