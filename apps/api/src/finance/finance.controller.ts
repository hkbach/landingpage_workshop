import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { type OrgContext, Client, CurrentOrg, CurrentUser, PlatformAdminGuard, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { FeesService, type FeeRatesPatch, type FeeRatesView } from "./fees.service";
import { FinanceService, type IncomeQuery } from "./finance.service";

const day = z.string().trim().max(10).optional();
const incomeQuery = z.object({ from: day, to: day, kind: z.enum(["PAYMENT", "REVERSAL"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
const rangeQuery = z.object({ from: day, to: day });
const feeListQuery = z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
// A rate is a whole number of basis points (1% = 100). What is wrong is named by the service (`invalid`, `totalTooHigh`); here a missing or non-numeric value is reported.
const bps = z.number({ error: (issue) => (issue.input === undefined ? "required" : "invalid") });
const allRates = z.object({ maintenanceBps: bps, serviceBps: bps, referralBps: bps, inviteBonusBps: bps });
const someRates = z.object({ maintenanceBps: bps, serviceBps: bps, referralBps: bps.optional(), inviteBonusBps: bps.optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/finance/*`: income, fees and profit of the shop of the session (FR-PAY-02). */
@Controller("finance")
@UseGuards(TenantGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("income")
  income(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(incomeQuery)) q: IncomeQuery) {
    return this.finance.income(org, q);
  }
}

/** `/api/v1/admin/*` money screens: fee rates (FR-ADM-17) and the income of the platform (FR-ADM-16, FR-ADM-24). SUPER_ADMIN only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminFinanceController {
  constructor(@Inject(FeesService) private readonly fees: FeesService, @Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get("fees")
  listFees(@Query(new ZodPipe(feeListQuery)) q: { q?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.fees.list(q);
  }

  @Put("fees/:id")
  setFees(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(allRates)) body: FeeRatesView) {
    return this.fees.set(id, body, actorOf(auth, client));
  }

  /** The same four rates for every shop. */
  @Post("fees/bulk")
  @HttpCode(200)
  bulkFees(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(allRates)) body: FeeRatesView) {
    return this.fees.bulk(body, actorOf(auth, client));
  }

  @Get("organizations/:id/finance-settings")
  financeSettings(@Param("id", new UuidPipe()) id: string) {
    return this.fees.get(id);
  }

  /** The form of one shop: the two fees; the other two rates keep their values unless they are sent. */
  @Put("organizations/:id/finance-settings")
  setFinanceSettings(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(someRates)) body: FeeRatesPatch) {
    return this.fees.set(id, body, actorOf(auth, client));
  }

  @Get("income")
  income(@Query(new ZodPipe(rangeQuery)) q: { from?: string | undefined; to?: string | undefined }) {
    return this.finance.adminIncome(q);
  }

  @Get("income/:id")
  shopIncome(@Param("id", new UuidPipe()) id: string, @Query(new ZodPipe(incomeQuery)) q: IncomeQuery) {
    return this.finance.adminShopIncome(id, q);
  }
}
