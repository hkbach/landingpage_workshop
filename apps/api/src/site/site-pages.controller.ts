import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseIntPipe, Post, Put, UseGuards } from "@nestjs/common";
import { type OrgContext, Client, CurrentOrg, CurrentUser, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import type { PageContent } from "../db/schema";
import { draftSchema, pageCreateSchema } from "./site.schemas";
import { SitePagesService } from "./site-pages.service";

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/site/pages` of the shop of the session: the landing pages and the builder. There is no endpoint that takes a shop id. */
@Controller("site/pages")
@UseGuards(TenantGuard)
export class SitePagesController {
  constructor(@Inject(SitePagesService) private readonly pages: SitePagesService) {}

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.pages.list(org);
  }

  @Post()
  create(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(pageCreateSchema)) body: { name: string; templateKey?: string | undefined }) {
    return this.pages.create(org, body, actorOf(auth, client));
  }

  @Get(":id")
  get(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.pages.get(org, id);
  }

  /** Autosave of the draft (the live page is not touched). */
  @Put(":id/draft")
  saveDraft(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(draftSchema)) body: { content: PageContent; theme?: Record<string, unknown> | undefined; templateKey?: string | undefined }) {
    return this.pages.saveDraft(org, id, body);
  }

  @Post(":id/publish")
  @HttpCode(200)
  publish(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    return this.pages.publish(org, id, actorOf(auth, client));
  }

  @Get(":id/versions")
  versions(@CurrentOrg() org: OrgContext, @Param("id", new UuidPipe()) id: string) {
    return this.pages.versions(org, id);
  }

  @Post(":id/rollback/:version")
  @HttpCode(200)
  rollback(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Param("version", ParseIntPipe) version: number) {
    return this.pages.rollback(org, id, version, actorOf(auth, client));
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    await this.pages.remove(org, id, actorOf(auth, client));
  }
}
