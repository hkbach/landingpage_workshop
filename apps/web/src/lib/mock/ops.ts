// Extra mock data for the operations / catalog screens (read-only base data lives in ./data.ts).
export interface ScheduleRule {
  id: string; workshopId: string; weekdays: number[]; times: string[];
  effectiveFrom: string; effectiveTo?: string; capacityOverride?: number; status: "ACTIVE" | "PAUSED";
}

export const scheduleRules: ScheduleRule[] = [
  { id: "sr-1", workshopId: "ws-1", weekdays: [1, 3, 5], times: ["09:00", "14:00"], effectiveFrom: "2026-01-01", status: "ACTIVE" },
  { id: "sr-2", workshopId: "ws-1", weekdays: [6], times: ["10:00"], effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", capacityOverride: 12, status: "ACTIVE" },
  { id: "sr-3", workshopId: "ws-2", weekdays: [2, 4], times: ["10:00", "14:00"], effectiveFrom: "2026-01-01", status: "PAUSED" },
];

/** ISO 3166-1 alpha-2 codes offered in the manual booking form (display names via Intl.DisplayNames). */
export const COUNTRY_CODES = [
  "VN", "US", "GB", "AU", "CA", "FR", "DE", "ES", "IT", "NL", "SE", "CH", "KR", "JP", "CN", "TW", "HK", "SG", "TH", "MY", "ID", "PH", "IN", "AE", "NZ", "BR", "MX",
] as const;
