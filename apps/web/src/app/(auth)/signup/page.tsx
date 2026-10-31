import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "../_components/auth-forms";

export default async function SignupPage() {
  const t = await getTranslations("auth.signup");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">{t("loginLink")}</Link>
      </p>
    </div>
  );
}
