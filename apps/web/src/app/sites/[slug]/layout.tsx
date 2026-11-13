import { requireSite } from "@/components/site/resolve";

// Resolves the tenant from the slug. Unknown, non-ACTIVE and SUSPENDED shops => 404 (REQUIREMENTS 3.3).
export default async function SiteLayout({ children, params }: LayoutProps<"/sites/[slug]">) {
  const { slug } = await params;
  await requireSite(slug);
  return <>{children}</>;
}
