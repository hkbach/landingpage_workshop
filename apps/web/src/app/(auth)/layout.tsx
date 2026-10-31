import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <AreaIntlProvider area="auth">
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-10">
        <Link href="/" className="mb-6 text-lg font-semibold">{t("appName")}</Link>
        <main className="w-full max-w-md rounded-xl bg-card p-6 shadow-sm ring-1 ring-foreground/10 sm:p-8">{children}</main>
      </div>
    </AreaIntlProvider>
  );
}
