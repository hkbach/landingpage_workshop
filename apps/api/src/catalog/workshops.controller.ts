import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { type OrgContext, CurrentOrg, CurrentUser, TenantGuard } from "../auth/auth.guards";
import type { AuthContext } from "../auth/auth.service";
import { Client } from "../auth/auth.guards";
import type { ClientContext } from "../auth/auth.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { workshopInputSchema, workshopListQuery, workshopStatusSchema, type WorkshopInput } from "./workshop.schemas";
import { WorkshopsService } from "./workshops.service";

/** `/api/v1/workshops` of the shop of the session. There is no DELETE: a workshop is never removed (FR-WS-01), only deactivated. */
@Controller("workshops")
@UseGuards(TenantGuard)
export class WorkshopsController {
  constructor(@Inject(WorkshopsService) private readonly workshops: WorkshopsService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(workshopListQuery)) query: { q?: string | undefined; status?: "ACTIVE" | "DRAFT" | undefined; limit: number; cursor?: string | undefined }) {
    return this.workshops.list(org, query);
  }

  @Post()
  create(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(workshopInputSchema)) body: WorkshopInput) {
    return this.workshops.create(org, body, { userId: auth.user.id, ip: client.ip });
  }

  @Get(":id")
  get(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.workshops.get(org, id);
  }

  @Put(":id")
  update(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(workshopInputSchema)) body: WorkshopInput) {
    return this.workshops.update(org, id, body, { userId: auth.user.id, ip: client.ip });
  }

  @Post(":id/status")
  @HttpCode(200)
  status(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(workshopStatusSchema)) body: { status: "ACTIVE" | "DRAFT" }) {
    return this.workshops.switchStatus(org, id, body.status, { userId: auth.user.id, ip: client.ip });
  }
}
