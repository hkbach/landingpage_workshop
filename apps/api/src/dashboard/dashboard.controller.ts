import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { TREND_PERIODS, type TrendPeriod } from "@workshop/shared";
import { type OrgContext, CurrentOrg, TenantGuard } from "../auth/auth.guards";
import { ZodPipe } from "../common/zod.pipe";
import { DashboardService } from "./dashboard.service";

const statsQuery = z.object({ period: z.enum(TREND_PERIODS, { error: "invalid" }).default("1m") });

/** `/api/v1/dashboard/*`: the overview of the shop of the session (FR-PAY-03). */
@Controller("dashboard")
@UseGuards(TenantGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get("summary")
  summary(@CurrentOrg() org: OrgContext) {
    return this.dashboard.summary(org);
  }

  @Get("booking-stats")
  stats(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(statsQuery)) q: { period: TrendPeriod }) {
    return this.dashboard.bookingStats(org, q.period);
  }
}
