import { CalendarClock, CalendarDays, ClipboardList, LayoutDashboard, Palette, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; key: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", key: "overview", icon: LayoutDashboard },
  { href: "/dashboard/today", key: "today", icon: CalendarClock },
  { href: "/dashboard/bookings", key: "bookings", icon: ClipboardList },
  { href: "/dashboard/customers", key: "customers", icon: Users },
  { href: "/dashboard/workshops", key: "workshops", icon: Sparkles },
  { href: "/dashboard/sessions", key: "sessions", icon: CalendarDays },
  { href: "/dashboard/site", key: "site", icon: Palette },
  { href: "/dashboard/settings", key: "settings", icon: Settings },
];
