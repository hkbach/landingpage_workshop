import Link from "next/link";
import { getTranslations } from "next-intl/server";

// An administrator would edit a shop here with the pages of the shop owner. Those pages read the shop of the SESSION, which a platform administrator does not have, so for now this says
// so. The API offers the five actions of an administrator on a shop (`/admin/shops/{id}/...`, with a reason); the admin lists use them where they are.
export default async function AdminShopLayout() {
  const t = await getTranslations("admin");
  return (
    <div className="grid gap-3" data-testid="admin-edit-unavailable">
      <p role="note" className="rounded-lg border bg-muted/40 p-3 text-sm">{t("editAs.unavailable")}</p>
      <Link href="/systemadmin/organizations" className="w-fit text-sm text-primary underline-offset-4 hover:underline">{t("orgDetail.backToList")}</Link>
    </div>
  );
}
