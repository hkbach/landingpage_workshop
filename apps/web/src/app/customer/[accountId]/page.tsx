import { redirect } from "next/navigation";

// /customer/{accountId} opens Today, the home page of the customer.
export default async function CustomerIndexPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  redirect(`/customer/${encodeURIComponent(accountId)}/today`);
}
