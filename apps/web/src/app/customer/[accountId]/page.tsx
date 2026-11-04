import { redirect } from "next/navigation";

// /customer/{accountId} opens the first menu, My Profile.
export default async function CustomerIndexPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  redirect(`/customer/${encodeURIComponent(accountId)}/profile`);
}
