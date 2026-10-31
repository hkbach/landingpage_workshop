import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "../_components/auth-forms";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgot");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm">
        <Link href="/login" className="font-medium underline underline-offset-4">{t("backToLogin")}</Link>
      </p>
    </div>
  );
}
