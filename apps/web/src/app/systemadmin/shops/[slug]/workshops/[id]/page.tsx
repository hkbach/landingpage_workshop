import { redirect } from "next/navigation";

// A workshop is edited in a popup of the list: this address leads to the list (in the admin area).
export default async function WorkshopPage({ params }: PageProps<"/systemadmin/shops/[slug]/workshops/[id]">) {
  const { slug } = await params;
  redirect(`/systemadmin/shops/${slug}/workshops`);
}
