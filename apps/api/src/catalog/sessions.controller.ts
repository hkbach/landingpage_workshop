import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { SessionStatus } from "@workshop/shared";
import { type OrgContext, Client, CurrentOrg, CurrentUser, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { ScheduleService } from "./schedule.service";
import { scheduleRuleSchema, sessionCloseSchema, sessionCreateSchema, sessionListQuery, sessionRescheduleSchema, sessionUpdateSchema, type ScheduleRuleInput } from "./session.schemas";
import { SessionsService } from "./sessions.service";
import type { Actor } from "./workshops.service";

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/sessions` of the shop of the session. There is no cancel: a session that is not used is paused, then closed (FR-SCHED-03). */
@Controller("sessions")
@UseGuards(TenantGuard)
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(sessionListQuery)) q: { workshopId?: string | undefined; status?: SessionStatus | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.sessions.list(org, q);
  }

  @Post()
  create(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(sessionCreateSchema)) body: { workshopId: string; startsAt: string; capacity?: number | undefined; bookingCutoffMinutes?: number | undefined; imageUrl?: string | undefined }) {
    return this.sessions.create(org, body, actorOf(auth, client));
  }

  @Get(":id")
  get(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.sessions.get(org, id);
  }

  @Patch(":id")
  update(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(sessionUpdateSchema)) body: { capacity?: number | undefined; bookingCutoffMinutes?: number | undefined; imageUrl?: string | undefined }) {
    return this.sessions.update(org, id, body, actorOf(auth, client));
  }

  @Post(":id/start")
  @HttpCode(200)
  start(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.sessions.act(org, id, "start", actorOf(auth, client));
  }

  @Post(":id/pause")
  @HttpCode(200)
  pause(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.sessions.act(org, id, "pause", actorOf(auth, client));
  }

  @Post(":id/close")
  @HttpCode(200)
  close(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(sessionCloseSchema)) body: { reason: { code: string; note?: string | undefined } }) {
    return this.sessions.close(org, id, body.reason, actorOf(auth, client));
  }

  @Post(":id/reopen")
  @HttpCode(200)
  reopen(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.sessions.reopen(org, id, actorOf(auth, client));
  }

  @Post(":id/reschedule")
  @HttpCode(200)
  reschedule(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(sessionRescheduleSchema)) body: { newStartsAt: string; reason: { code: string; note?: string | undefined } }) {
    return this.sessions.reschedule(org, id, body, actorOf(auth, client));
  }

  @Post(":id/complete")
  @HttpCode(200)
  complete(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.sessions.complete(org, id, actorOf(auth, client));
  }
}

/** The weekly schedule rules of a workshop (FR-SCHED-01). */
@Controller()
@UseGuards(TenantGuard)
export class ScheduleRulesController {
  constructor(@Inject(ScheduleService) private readonly schedule: ScheduleService) {}

  @Get("workshops/:workshopId/schedule-rules")
  list(@CurrentOrg() org: OrgContext, @Param("workshopId", new UuidPipe()) workshopId: string) {
    return this.schedule.list(org, workshopId).then((items) => ({ items }));
  }

  @Post("workshops/:workshopId/schedule-rules")
  create(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("workshopId", new UuidPipe()) workshopId: string, @Body(new ZodPipe(scheduleRuleSchema)) body: ScheduleRuleInput) {
    return this.schedule.create(org, workshopId, body, actorOf(auth, client));
  }

  @Put("schedule-rules/:id")
  update(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(scheduleRuleSchema)) body: ScheduleRuleInput) {
    return this.schedule.update(org, id, body, actorOf(auth, client));
  }

  @Delete("schedule-rules/:id")
  remove(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.schedule.remove(org, id, actorOf(auth, client));
  }
}
