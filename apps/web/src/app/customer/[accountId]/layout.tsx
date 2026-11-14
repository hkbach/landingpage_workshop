import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { CustomerShell } from "@/components/customer/customer-shell";
import { requireArea } from "@/lib/api-server";
import { loadSupport } from "@/lib/own-shop";
import { TEMPLATES } from "@/components/sections/templates";
import { ConsentGate } from "@/components/auth/consent-gate";

// The account of a customer: /customer/{accountId}/... Only the customer of THIS account, with a session, gets in. The area belongs to the platform, not to one shop (no slug), in the
// neutral theme; the way to reach the platform comes from the server.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CustomerLayout({ children, params }: { children: ReactNode; params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  await requireArea("CUSTOMER", (me) => me.id === accountId);
  return (
    <AreaIntlProvider area="customer">
      <CustomerShell accountId={accountId} shop={{ slug: "", name: "Workshop Platform" }} theme={TEMPLATES.classic.theme} loginRequired={false} support={await loadSupport()}>
        {children}
      </CustomerShell>
      <ConsentGate />
    </AreaIntlProvider>
  );
}
