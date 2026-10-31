import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

// Mock: the real page will verify the one-time token server-side. `?state=expired` simulates an expired/used link.
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { state } = await searchParams;
  const expired = state === "expired";
  const t = await getTranslations("auth.verify");
  const Icon = expired ? XCircle : CheckCircle2;
  return (
    <div className="grid justify-items-center gap-4 text-center" role="status">
      <Icon className={expired ? "size-10 text-destructive" : "size-10 text-emerald-600"} aria-hidden />
      <h1 className="text-xl font-semibold">{expired ? t("expiredTitle") : t("successTitle")}</h1>
      <p className="text-sm text-muted-foreground">{expired ? t("expiredBody") : t("successBody")}</p>
      {expired ? (
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>{t("signupAgain")}</Link>
      ) : (
        <Link href="/shopowner/onboarding" className={buttonVariants({ size: "lg" })}>{t("continue")}</Link>
      )}
    </div>
  );
}
