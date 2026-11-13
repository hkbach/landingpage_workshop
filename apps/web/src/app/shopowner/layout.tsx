import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";
import { requireArea } from "@/lib/api-server";
import { ConsentGate } from "@/components/auth/consent-gate";

// Covers the shop owner pages with the shell ([slug]) and the onboarding wizard. Connected to the API: only a shop owner with a session gets in.
export default async function ShopOwnerLayout({ children }: { children: ReactNode }) {
  await requireArea("SHOP_OWNER");
  return (
    <AreaIntlProvider area="shopowner">
      {children}
      <ConsentGate />
    </AreaIntlProvider>
  );
}
