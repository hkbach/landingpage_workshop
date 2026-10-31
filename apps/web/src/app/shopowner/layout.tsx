import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";

// Covers the shop owner pages with the shell (app) and the onboarding wizard.
export default function ShopOwnerLayout({ children }: { children: ReactNode }) {
  return <AreaIntlProvider area="shopowner">{children}</AreaIntlProvider>;
}
