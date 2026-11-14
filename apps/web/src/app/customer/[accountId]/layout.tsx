import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { CustomerShell } from "@/components/customer/customer-shell";
import { customerLoginRequired } from "@/lib/customer-access";
import { currentShop, sitePage } from "@/lib/mock/data";
import { getPlatformSupport } from "@/lib/mock/platform";
import { realApi, requireArea } from "@/lib/api-server";
import { loadSupport } from "@/lib/own-shop";
import { TEMPLATES } from "@/components/sections/templates";
import { ConsentGate } from "@/components/auth/consent-gate";

// The account of a guest: /customer/{accountId}/... The id is the one of the customer. Nothing about the account is read here: the shell asks the server (with the
// email the guest logged in with, when the login is required: always in production), so an id that is not theirs never gets the data.
// TODO(api): the shop of the guest session (customers belong to one shop); here the shop of the demo.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerLayout({ children, params }: { children: ReactNode; params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const connected = realApi();
  await requireArea("CUSTOMER", (me) => me.id === accountId); // connected to the API: the customer of THIS account, with a session
  return (
    <AreaIntlProvider area="customer">
      {/* Connected: the area is the customer's own (the platform, no shop: no slug), in the neutral theme; the contact of the platform comes from the server. */}
      <CustomerShell
        accountId={accountId} shop={connected ? { slug: "", name: "Workshop Platform" } : { slug: currentShop.slug, name: currentShop.name }} theme={connected ? TEMPLATES.classic.theme : sitePage.theme}
        loginRequired={!connected && customerLoginRequired()} support={connected ? await loadSupport() : getPlatformSupport()}
      >
        {children}
      </CustomerShell>
      <ConsentGate />
    </AreaIntlProvider>
  );
}
