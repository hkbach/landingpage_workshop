import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing/marketing-shell";

// The public pages of the platform (Home, About Us, Contact) share the dark bar and the footer. Privacy and Terms keep their plain layout.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}
