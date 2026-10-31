"use client";

import { createContext, useContext } from "react";

/**
 * Lets the footer's "Report this site" link open the report popup without knowing about it. `open` is null where no
 * popup exists; the link then stays a normal link to the report page (also what happens without JavaScript).
 */
export interface ReportActions { open: (() => void) | null }

export const ReportActionsContext = createContext<ReportActions>({ open: null });
export function useReportActions(): ReportActions {
  return useContext(ReportActionsContext);
}
