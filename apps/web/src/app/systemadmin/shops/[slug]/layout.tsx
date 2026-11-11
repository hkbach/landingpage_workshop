import { notFound } from "next/navigation";
import { AdminEditBanner } from "@/components/admin/admin-edit-banner";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { currentShop } from "@/lib/mock/data";

// An administrator edits a shop here: the same pages as the shop owner's (landing pages, workshops, sessions), on the admin site, inside the admin shell. The owner's pages
// read the demo shop, so only that shop has something to edit (the mock has no data for the others). TODO(api): the organization of the slug, SUPER_ADMIN only.
export default async function AdminShopLayout({ children, params }: LayoutProps<"/systemadmin/shops/[slug]">) {
  const { slug } = await params;
  if (slug !== currentShop.slug) notFound();
  return (
    <div className="grid gap-4">
      <AdminEditBanner shopName={currentShop.name} slug={slug} />
      {/* The pages of the shop owner use the texts of the shop owner area. */}
      <AreaIntlProvider area="shopowner">{children}</AreaIntlProvider>
    </div>
  );
}
