import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function LegalPage() {
  const t = await getTranslations("marketing.legal");
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold">{t("terms.title")}</h1>
      <p className="mt-4 text-muted-foreground">{t("pendingNotice")}</p>
      <Link href="/" className="mt-8 inline-block underline">
        {t("back")}
      </Link>
    </main>
  );
}
