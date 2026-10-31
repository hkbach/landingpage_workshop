import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "../_components/auth-forms";

export default async function LoginPage() {
  const t = await getTranslations("auth.login");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">{t("signupLink")}</Link>
      </p>
    </div>
  );
}
