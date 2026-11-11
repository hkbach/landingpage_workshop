import { redirect } from "next/navigation";

// A workshop is created in a popup of the list: this address leads to the list (in the admin area).
export default async function NewWorkshopPage({ params }: PageProps<"/systemadmin/shops/[slug]/workshops/new">) {
  const { slug } = await params;
  redirect(`/systemadmin/shops/${slug}/workshops`);
}
