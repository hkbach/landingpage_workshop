import type { OrgStatus } from "@workshop/shared";

export const COUNTRIES = ["VN", "TH", "SG", "ID", "MY", "PH", "JP", "KR", "AU", "GB", "US"] as const;
export const CURRENCIES = ["VND", "USD", "EUR", "JPY", "KRW", "SGD", "THB"] as const;
export const TIMEZONES = [
  "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "Asia/Jakarta", "Asia/Kuala_Lumpur", "Asia/Manila",
  "Asia/Tokyo", "Asia/Seoul", "Australia/Sydney", "Europe/London", "Europe/Paris", "America/New_York",
  "America/Los_Angeles", "UTC",
] as const;

export const PLATFORM_DOMAIN = "localtest.me";

export function statusBadgeVariant(status: OrgStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "ACTIVE": return "default";
    case "DRAFT": return "secondary";
    case "PENDING_REVIEW": return "outline";
    case "SUSPENDED": return "destructive";
  }
}
