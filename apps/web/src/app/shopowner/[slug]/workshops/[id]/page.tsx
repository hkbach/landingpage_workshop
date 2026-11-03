import { notFound, redirect } from "next/navigation";
import { workshops } from "@/lib/mock/data";

// A workshop is a popup over the list now (its title and the Edit button open it): an old address goes to the list.
export default async function WorkshopPage(props: PageProps<"/shopowner/[slug]/workshops/[id]">) {
  const { slug, id } = await props.params;
  if (!workshops.some((w) => w.id === id)) notFound();
  redirect(`/shopowner/${slug}/workshops`);
}
