import { notFound } from "next/navigation";
import { ActingFetch } from "@/components/admin/acting-fetch";
import { AdminEditBanner } from "@/components/admin/admin-edit-banner";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { loadAdminShop } from "@/lib/admin-shop";

// An administrator edits a shop here. The landing pages use the editor of the shop owner, reading and saving through the routes of the administrator (`/api/v1/admin/shops/{id}/site/...`), each
// change with the reason given in the banner. The workshops and the sessions are the shop owner's pages too: the browser of the administrator sends the shop and the reason with every call
// (components/admin/acting-fetch.tsx) and the server side of the pages asks for the shop named by the proxy (lib/api-server.ts).
export default async function AdminShopLayout({ children, params }: LayoutProps<"/systemadmin/shops/[slug]">) {
  const { slug } = await params;
  const shop = await loadAdminShop(slug);
  if (!shop) notFound();
  return (
    <AreaIntlProvider area="adminEdit">
      <div className="grid gap-3">
        <ActingFetch slug={shop.slug} />
        <AdminEditBanner shopName={shop.name} slug={shop.slug} />
        {children}
      </div>
    </AreaIntlProvider>
  );
}
