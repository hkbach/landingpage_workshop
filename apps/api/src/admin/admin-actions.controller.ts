import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Client, CurrentUser, PlatformAdminGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { AdminActionsService } from "./admin-actions.service";

// The reason is checked by the service (one message for all of them: ADMIN_REASON_REQUIRED), so here it is only read as text.
const reason = z.string().optional();
const statusBody = z.object({ status: z.enum(["ACTIVE", "DRAFT"], { error: "invalid" }), reason });
const reasonBody = z.object({ reason });
const rescheduleBody = z.object({ newStartsAt: z.string({ error: "required" }).datetime({ offset: true, error: "invalid" }), reason });

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
  publishPage(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("shopId", new UuidPipe()) shopId: string, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(reasonBody)) body: z.infer<typeof reasonBody>) {
    return this.actions.publishPage(shopId, id, body.reason, actorOf(auth, client));
  }
}
