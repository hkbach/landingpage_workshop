import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Client, CurrentUser, PlatformAdminGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { sessionListQuery } from "../catalog/session.schemas";
import { workshopListQuery } from "../catalog/workshop.schemas";
import { draftSchema, pageCreateSchema } from "../site/site.schemas";
import { AdminActionsService } from "./admin-actions.service";

// The reason is checked by the service (one message for all of them: ADMIN_REASON_REQUIRED), so here it is only read as text.
const reason = z.string().optional();
const statusBody = z.object({ status: z.enum(["ACTIVE", "DRAFT"], { error: "invalid" }), reason });
const reasonBody = z.object({ reason });
const rescheduleBody = z.object({ newStartsAt: z.string({ error: "required" }).datetime({ offset: true, error: "invalid" }), reason });

/** The reason of an edit: in the body, or in the `X-Admin-Reason` header (URI-encoded: the editor of the landing page saves with fetch and sends it there at every save). */
const reasonOf = (body: string | undefined, header: string | undefined): string | undefined => {
  if (body !== undefined) return body;
  if (!header) return undefined;
  try { return decodeURIComponent(header); } catch { return header; }
};

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/admin/shops/{shopId}/*`: the platform administrator acts on behalf of a shop (D15). Every call needs a `reason`; without it nothing changes (`422 ADMIN_REASON_REQUIRED`). SUPER_ADMIN only. */
@Controller("admin/shops/:shopId")
@UseGuards(PlatformAdminGuard)
export class AdminActionsController {
  constructor(@Inject(AdminActionsService) private readonly actions: AdminActionsService) {}

  @Post("workshops/:id/status")
  @HttpCode(200)
  workshopStatus(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(statusBody)) body: z.infer<typeof statusBody>) {
    return this.actions.setWorkshopStatus(shopId, id, body.status, body.reason, actorOf(auth, client));
  }

  @Post("sessions/:id/close")
  @HttpCode(200)
  closeSession(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>) {
    return this.actions.closeSession(shopId, id, body.reason, actorOf(auth, client));
  }

  @Post("sessions/:id/reopen")
  @HttpCode(200)
  reopenSession(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>) {
    return this.actions.reopenSession(shopId, id, body.reason, actorOf(auth, client));
  }

  @Post("sessions/:id/reschedule")
  @HttpCode(200)
  rescheduleSession(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(rescheduleBody)) body: z.infer<typeof rescheduleBody>) {
    return this.actions.rescheduleSession(shopId, id, body.newStartsAt, body.reason, actorOf(auth, client));
  }

  @Post("site/pages/:id/publish")
  @HttpCode(200)
  publishPage(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>, @Headers("x-admin-reason") header?: string) {
    return this.actions.publishPage(shopId, id, reasonOf(body.reason, header), actorOf(auth, client));
  }

  // ---- the editor of the landing pages (the same lists and saves as the ones of the shop owner, for the shop in the path) ----

  @Get("site/pages")
  pages(@Param("shopId", new UuidPipe()) shopId: string) {
    return this.actions.listPages(shopId);
  }

  @Get("site/pages/:id")
  page(@Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string) {
    return this.actions.getPage(shopId, id);
  }

  @Post("site/pages")
  createPage(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Body(new ZodPipe(pageCreateSchema)) body: { name: string; templateKey?: string | undefined }, @Headers("x-admin-reason") header?: string) {
    return this.actions.createPage(shopId, body, reasonOf(undefined, header), actorOf(auth, client));
  }

  @Put("site/pages/:id/draft")
  saveDraft(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(draftSchema)) body: z.infer<typeof draftSchema>, @Headers("x-admin-reason") header?: string) {
    return this.actions.saveDraft(shopId, id, body, reasonOf(undefined, header), actorOf(auth, client));
  }

  @Get("workshops")
  workshops(@Param("shopId", new UuidPipe()) shopId: string, @Query(new ZodPipe(workshopListQuery)) query: z.infer<typeof workshopListQuery>) {
    return this.actions.listWorkshops(shopId, query);
  }

  @Get("sessions")
  sessions(@Param("shopId", new UuidPipe()) shopId: string, @Query(new ZodPipe(sessionListQuery)) query: z.infer<typeof sessionListQuery>) {
    return this.actions.listSessions(shopId, query);
  }

  @Get("promotions")
  promotions(@Param("shopId", new UuidPipe()) shopId: string) {
    return this.actions.listPromotions(shopId);
  }
}
