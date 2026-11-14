import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-server";

// Connected to the API: the link of the email carries a one-time token, and this page spends it (the API says whether it was good). Sample data: `?state=expired` simulates an expired or used link.
export const dynamic = "force-dynamic";
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { token } = await searchParams;
  const sent = typeof token === "string" ? token : "";
  const res = sent ? await apiFetch("/auth/verify-email", { method: "POST", body: JSON.stringify({ token: sent }) }).catch(() => null) : null;
  const expired = !res?.ok;
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
        <Link href="/login" className={buttonVariants({ size: "lg" })}>{(await getTranslations("auth.login"))("submit")}</Link>
      )}
    </div>
  );
}
