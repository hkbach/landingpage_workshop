import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { CustomerShell } from "@/components/customer/customer-shell";
import { customerLoginRequired } from "@/lib/customer-access";
import { currentShop, sitePage } from "@/lib/mock/data";
import { platformSupport } from "@/lib/mock/platform";

// The account of a guest: /customer/{accountId}/... The id is the one of the customer. Nothing about the account is read here: the shell asks the server (with the
// email the guest logged in with, when the login is required: always in production), so an id that is not theirs never gets the data.
// TODO(api): the shop of the guest session (customers belong to one shop); here the shop of the demo.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerLayout({ children, params }: { children: ReactNode; params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return (
    <AreaIntlProvider area="customer">
      <CustomerShell accountId={accountId} shop={{ slug: currentShop.slug, name: currentShop.name }} theme={sitePage.theme} loginRequired={customerLoginRequired()} support={platformSupport}>{children}</CustomerShell>
    </AreaIntlProvider>
  );
}
