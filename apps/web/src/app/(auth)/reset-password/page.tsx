import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "../_components/auth-forms";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.reset");
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
