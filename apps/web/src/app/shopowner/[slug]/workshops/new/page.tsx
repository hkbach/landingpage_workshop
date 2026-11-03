import { redirect } from "next/navigation";

// New workshop is a popup over the list now: an old address goes to the list.
export default async function NewWorkshopPage({ params }: PageProps<"/shopowner/[slug]/workshops/new">) {
  const { slug } = await params;
  redirect(`/shopowner/${slug}/workshops`);
}
