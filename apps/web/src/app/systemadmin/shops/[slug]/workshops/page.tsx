import Link from "next/link";
import { getTranslations } from "next-intl/server";

// The workshops of a shop are not edited here yet: the shop owner's page reads the shop of the SESSION, which an administrator does not have. The lists of the admin area act on them with a reason.
export default async function AdminShopWorkshopsUnavailable() {
  const t = await getTranslations("admin");
  return (
    <div className="grid gap-3" data-testid="admin-edit-unavailable">
      <p role="note" className="rounded-lg border bg-muted/40 p-3 text-sm">{t("editAs.unavailable")}</p>
      <Link href="/systemadmin/organizations" className="w-fit text-sm text-primary underline-offset-4 hover:underline">{t("orgDetail.backToList")}</Link>
    </div>
  );
}
