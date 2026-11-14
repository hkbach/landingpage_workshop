import { notFound } from "next/navigation";
import { AdminEditBanner } from "@/components/admin/admin-edit-banner";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { loadAdminShop } from "@/lib/admin-shop";

// An administrator edits a shop here. The landing pages use the editor of the shop owner, reading and saving through the routes of the administrator (`/api/v1/admin/shops/{id}/site/...`), each
// change with the reason given in the banner. The sessions and the workshops are not open here yet (see their pages): the lists of the admin area act on them with a reason where they are.
export default async function AdminShopLayout({ children, params }: LayoutProps<"/systemadmin/shops/[slug]">) {
  const { slug } = await params;
  const shop = await loadAdminShop(slug);
  if (!shop) notFound();
  return (
    <AreaIntlProvider area="adminEdit">
      <div className="grid gap-3">
        <AdminEditBanner shopName={shop.name} slug={shop.slug} />
        {children}
      </div>
    </AreaIntlProvider>
  );
}
