// A weekly schedule rule of a workshop, as the editor shows it.
export interface ScheduleRule {
  id: string; workshopId: string; weekdays: number[]; times: string[];
  effectiveFrom: string; effectiveTo?: string; capacityOverride?: number; status: "ACTIVE" | "PAUSED";
}
