import { CalendarClock, CalendarDays, ClipboardList, LayoutDashboard, Palette, Settings, Sparkles, Users, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; key: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: "/shopowner", key: "overview", icon: LayoutDashboard },
  { href: "/shopowner/today", key: "today", icon: CalendarClock },
  { href: "/shopowner/bookings", key: "bookings", icon: ClipboardList },
  { href: "/shopowner/customers", key: "customers", icon: Users },
  { href: "/shopowner/workshops", key: "workshops", icon: Sparkles },
  { href: "/shopowner/sessions", key: "sessions", icon: CalendarDays },
  { href: "/shopowner/finance", key: "finance", icon: Wallet },
  { href: "/shopowner/site", key: "site", icon: Palette },
  { href: "/shopowner/settings", key: "settings", icon: Settings },
];
