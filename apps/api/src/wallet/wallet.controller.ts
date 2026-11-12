import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard, Client, CurrentUser, PlatformAdminGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { WalletService, type WalletSource } from "./wallet.service";

const source = z.enum(["AFFILIATE", "REFERRAL"], { error: "invalid" });
const currency = z.string({ error: "required" }).trim().toUpperCase().regex(/^[A-Z]{3}$/, "invalid");
// Whole minor units, at most 10^12 (a limit that keeps the sums far from the range of a number).
const money = (min: number) => z.number({ error: (i) => (i.input === undefined ? "required" : "invalid") }).int("invalid").min(min, "invalid").max(1_000_000_000_000, "invalid");
const walletQuery = z.object({ source: source.optional() });
const requestBody = z.object({ source, currency, amount: money(1) });
const listQuery = z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(["PENDING", "PAID", "REJECTED"]).optional(), source: source.optional(),
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid").optional(), to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid").optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional(),
});
const processBody = z.object({ action: z.enum(["pay", "reject"], { error: "invalid" }), reason: z.string().trim().max(300, "tooLong").optional() });
const limitsBody = z.object({ currency, minAmount: money(0), maxAmount: money(0) });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/customer/{id}/*`: the wallet of the account in the session. The id in the path must be the account's own (anything else is a 404, never a peek at another wallet). */
@Controller("customer")
@UseGuards(AuthGuard)
export class WalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  private own(auth: AuthContext, id: string): string {
    if (id !== auth.user.id) throw new NotFoundException({ code: "NOT_FOUND", message: "Account not found." });
    return auth.user.id;
  }

  @Get(":id/wallet")
  get(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string, @Query(new ZodPipe(walletQuery)) q: { source?: WalletSource | undefined }) {
    return this.wallet.wallet(this.own(auth, id), q.source);
  }

  @Post(":id/withdrawals")
  request(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(requestBody)) body: { source: WalletSource; currency: string; amount: number }) {
    return this.wallet.request(this.own(auth, id), body, actorOf(auth, client));
  }
}

/** The invoices of the customers and the limits of a withdrawal (FR-ADM-19, FR-ADM-20): the platform administrator only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminWalletController {
  constructor(@Inject(WalletService) private readonly wallet: WalletService) {}

  @Get("directory/withdrawals")
  list(@Query(new ZodPipe(listQuery)) q: { q?: string | undefined; status?: "PENDING" | "PAID" | "REJECTED" | undefined; source?: WalletSource | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.wallet.list(q);
  }

  @Post("withdrawals/:id")
  @HttpCode(200)
  process(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(processBody)) body: { action: "pay" | "reject"; reason?: string | undefined }) {
    return this.wallet.process(id, body, actorOf(auth, client));
  }

  @Get("settings/withdrawal-limits")
  limits() {
    return this.wallet.listLimits();
  }

  @Put("settings/withdrawal-limits")
  setLimits(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(limitsBody)) body: { currency: string; minAmount: number; maxAmount: number }) {
    return this.wallet.setLimits(body, actorOf(auth, client));
  }
}
