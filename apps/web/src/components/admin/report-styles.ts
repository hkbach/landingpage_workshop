import type { ReportStatus } from "@workshop/shared";

/** Dark text on a light background for every status (contrast of at least 4.5:1), never colour alone: the label is always shown. */
export const REPORT_STATUS_STYLES: Record<ReportStatus, string> = {
  OPEN: "bg-amber-100 text-amber-950",
  RESOLVED: "bg-emerald-100 text-emerald-950",
  DISMISSED: "bg-slate-200 text-slate-900",
};
