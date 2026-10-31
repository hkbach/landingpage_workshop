import type { Session, Workshop } from "@/lib/types";

/** ACTIVE workshops that have at least one OPEN session in the future (FR-SITE-04 prerequisite). */
export function countWorkshopsWithUpcomingSessions(workshops: Workshop[], sessions: Session[]): number {
  const now = Date.now();
  return workshops.filter(
    (w) => w.status === "ACTIVE" && sessions.some((s) => s.workshopId === w.id && s.status === "OPEN" && new Date(s.startsAt).getTime() > now),
  ).length;
}
