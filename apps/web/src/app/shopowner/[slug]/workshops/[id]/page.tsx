import { redirect } from "next/navigation";

// A workshop is a popup over the list now (its title and the Edit button open it): an old address goes to the list.
export default async function WorkshopPage(props: PageProps<"/shopowner/[slug]/workshops/[id]">) {
  const { slug } = await props.params;
  redirect(`/shopowner/${slug}/workshops`);
}
