import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function OrganizationNotFound() {
  const t = await getTranslations("admin.orgDetail");
  return (
    <div className="grid justify-items-start gap-3">
      <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <Link href="/admin/organizations" className={buttonVariants({ variant: "outline" })}>
        {t("backToList")}
      </Link>
    </div>
  );
}
