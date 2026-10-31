import type { ReactNode } from "react";
import { AreaIntlProvider } from "@/i18n/AreaIntlProvider";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <AreaIntlProvider area="marketing">{children}</AreaIntlProvider>;
}
