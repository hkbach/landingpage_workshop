import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PROMOTION_STATUSES, promotionInputSchema, type PromotionInput, type PromotionStatus } from "@workshop/shared";
import { type OrgContext, Client, CurrentOrg, CurrentUser, PlatformAdminGuard, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { PromotionsService } from "./promotions.service";

const pauseBody = z.object({ enabled: z.boolean({ error: "required" }) });
const holdBody = z.object({ hold: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() });
const adminQuery = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(PROMOTION_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/promotions`: the promotions of the shop of the session (FR-PROMO-01). A promotion of another shop is a 404. */
@Controller("promotions")
@UseGuards(TenantGuard)
export class PromotionsController {
  constructor(@Inject(PromotionsService) private readonly promotions: PromotionsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.promotions.list(org);
  }

  @Post()
  create(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(promotionInputSchema)) body: PromotionInput) {
    return this.promotions.create(org, body, actorOf(auth, client));
  }

  @Put(":id")
  update(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(promotionInputSchema)) body: PromotionInput) {
    return this.promotions.update(org, id, body, actorOf(auth, client));
  }

  /** `{ enabled }`: pause or resume without touching anything else. */
  @Patch(":id")
  pause(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(pauseBody)) body: { enabled: boolean }) {
    return this.promotions.setEnabled(org, id, body.enabled, actorOf(auth, client));
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string): Promise<void> {
    await this.promotions.remove(org, id, actorOf(auth, client));
  }
}

/** The promotions of every shop for the platform administrator (FR-ADM-25). SUPER_ADMIN only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminPromotionsController {
  constructor(@Inject(PromotionsService) private readonly promotions: PromotionsService) {}

  @Get("directory/promotions")
  list(@Query(new ZodPipe(adminQuery)) q: { q?: string | undefined; status?: PromotionStatus | undefined; limit: number; cursor?: string | undefined }) {
    return this.promotions.adminList(q);
  }

  @Post("promotions/:id")
  @HttpCode(200)
  hold(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(holdBody)) body: { hold: boolean; reason?: string | undefined }) {
    return this.promotions.hold(id, body, actorOf(auth, client));
  }
}
