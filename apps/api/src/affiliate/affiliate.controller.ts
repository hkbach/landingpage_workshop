import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import { AuthGuard, Client, CurrentUser, PlatformAdminGuard, PublicRoute } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { AffiliateService } from "./affiliate.service";

const registerBody = z.object({ workshopId: z.uuid({ error: "invalid" }) });
const clickBody = z.object({ code: z.string({ error: "required" }).trim().max(20, "invalid"), count: z.number().int("invalid").min(1, "invalid").max(20, "invalid").default(1) });
const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid").optional();
const listQuery = z.object({ q: z.string().trim().max(100).optional(), from: day, to: day, limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() });
const switchBody = z.object({ disabled: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() });
const programQuery = z.object({ q: z.string().trim().max(100).optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/customer/{id}/*`: the links of the account in the session. The id in the path must be the account's own (anything else is a 404). */
@Controller("customer")
@UseGuards(AuthGuard)
export class CustomerAffiliateController {
  constructor(@Inject(AffiliateService) private readonly affiliate: AffiliateService) {}

  private own(auth: AuthContext, id: string): string {
    if (id !== auth.user.id) throw new NotFoundException({ code: "NOT_FOUND", message: "Account not found." });
    return auth.user.id;
  }

  @Get(":id/referrals")
  links(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string, @Query(new ZodPipe(programQuery)) q: { q?: string | undefined }) {
    return this.affiliate.myLinks(this.own(auth, id), q.q);
  }

  /** 201 with a new link, 200 with the one the account already has for the workshop. */
  @Post(":id/referrals")
  async register(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(registerBody)) body: { workshopId: string }, @Res({ passthrough: true }) reply: FastifyReply) {
    const { link, created } = await this.affiliate.register(this.own(auth, id), body.workshopId, actorOf(auth, client));
    void reply.status(created ? 201 : 200);
    return link;
  }

  @Get(":id/invites")
  invites(@CurrentUser() auth: AuthContext, @Param("id", new UuidPipe()) id: string) {
    return this.affiliate.myInvites(this.own(auth, id));
  }
}

/** The landing page of a shop counts a visit of an affiliate link. No account, no cookie. */
@Controller("public")
@PublicRoute()
export class PublicAffiliateController {
  constructor(@Inject(AffiliateService) private readonly affiliate: AffiliateService) {}

  @Post("sites/:slug/referrals/click")
  @HttpCode(200)
  click(@Param("slug") slug: string, @Body(new ZodPipe(clickBody)) body: { code: string; count: number }, @Client() client: ClientContext) {
    return this.affiliate.click(slug, body.code, body.count, client.ip);
  }
}

/** The affiliate and the referral screens of the platform administrator (FR-ADM-15, FR-ADM-18). SUPER_ADMIN only. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminAffiliateController {
  constructor(@Inject(AffiliateService) private readonly affiliate: AffiliateService) {}

  @Get("directory/affiliate")
  links(@Query(new ZodPipe(listQuery)) q: { q?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.affiliate.adminLinks(q);
  }

  @Post("affiliate/:id")
  @HttpCode(200)
  switchLink(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(switchBody)) body: { disabled: boolean; reason?: string | undefined }) {
    return this.affiliate.setLinkDisabled(id, body, actorOf(auth, client));
  }

  @Get("directory/referrals")
  invites(@Query(new ZodPipe(listQuery)) q: { q?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.affiliate.adminInvites(q);
  }

  @Post("referrals/:accountId")
  @HttpCode(200)
  switchInvite(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("accountId", new UuidPipe()) accountId: string, @Body(new ZodPipe(switchBody)) body: { disabled: boolean; reason?: string | undefined }) {
    return this.affiliate.setInviteDisabled(accountId, body, actorOf(auth, client));
  }
}
