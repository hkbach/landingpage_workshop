import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminEditBanner } from "@/components/admin/admin-edit-banner";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { currentShop } from "@/lib/mock/data";
import { realApi } from "@/lib/api-server";

// An administrator edits a shop here: the same pages as the shop owner's (landing pages, workshops, sessions), on the admin site, inside the admin shell. The owner's pages
// read the demo shop, so only that shop has something to edit in the sample data.
// Connected to the API the owner's pages read the shop of the SESSION, which a platform administrator does not have, so this is not available yet: the API offers the five actions of an
// administrator on a shop (`/admin/shops/{id}/...`, with a reason) and the admin lists use them where they are.
export default async function AdminShopLayout({ children, params }: LayoutProps<"/systemadmin/shops/[slug]">) {
  const { slug } = await params;
  if (realApi()) {
    const t = await getTranslations("admin");
    return (
      <div className="grid gap-3" data-testid="admin-edit-unavailable">
        <p role="note" className="rounded-lg border bg-muted/40 p-3 text-sm">{t("editAs.unavailable")}</p>
        <Link href="/systemadmin/organizations" className="w-fit text-sm text-primary underline-offset-4 hover:underline">{t("orgDetail.backToList")}</Link>
      </div>
    );
  }
  if (slug !== currentShop.slug) notFound();
  return (
    <div className="grid gap-4">
      <AdminEditBanner shopName={currentShop.name} slug={slug} />
      {/* The pages of the shop owner use the texts of the shop owner area. */}
      <AreaIntlProvider area="shopowner">{children}</AreaIntlProvider>
    </div>
  );
}
