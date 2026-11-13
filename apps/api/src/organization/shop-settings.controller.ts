import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { type OrgContext, Client, CurrentOrg, CurrentUser, PlatformAdminGuard, PublicRoute, TenantGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { assertShopWritable } from "../tenant/shop-writable";
import { ShopSettingsService, type ShopSettingsInput } from "./shop-settings.service";

const isHttps = (v: string) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const text = (max: number) => z.string({ error: "invalid" }).trim().max(max, "tooLong");
// Every text is trimmed (BR-16). A field that is left out does not change; the codes of the errors are the ones the form knows.
const settingsFields = {
  name: text(120).min(1, "required").optional(),
  contactEmail: z.string({ error: "invalid" }).trim().toLowerCase().max(254, "tooLong").pipe(z.email("invalid")).optional(),
  contactPhone: text(40).optional(), whatsapp: text(40).optional(), address: text(300).optional(),
  mapsUrl: text(500).refine((v) => v === "" || isHttps(v), "invalid").optional(),
  country: z.string({ error: "invalid" }).trim().toUpperCase().optional(),
  timezone: text(64).min(1, "required").optional(), currency: z.string({ error: "invalid" }).trim().toUpperCase().regex(/^[A-Z]{3}$/, "invalid").optional(),
  defaultLocale: z.enum(LOCALES, { error: "invalid" }).optional(), enabledLocales: z.array(z.enum(LOCALES, { error: "invalid" })).min(1, "invalid").max(5).optional(),
};
const ownerBody = z.object(settingsFields);
const adminBody = z.object({ ...settingsFields, customDomain: z.string({ error: "invalid" }).max(300, "tooLong").optional(), reason: z.string().trim().max(300, "tooLong").optional() });
const domainBody = z.object({ domain: z.string({ error: "required" }) });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** The settings and the own domain of the shop of the session (FR-ORG-02, D13). A suspended shop is read only. */
@Controller()
@UseGuards(TenantGuard)
export class ShopSettingsController {
  constructor(@Inject(ShopSettingsService) private readonly settings: ShopSettingsService) {}

  @Patch("organization")
  update(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(ownerBody)) body: ShopSettingsInput) {
    assertShopWritable(org);
    return this.settings.update(org.id, body, actorOf(auth, client));
  }

  @Get("shop/domain")
  domain(@CurrentOrg() org: OrgContext) {
    return this.settings.domain(org.id);
  }

  @Put("shop/domain")
  setDomain(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Body(new ZodPipe(domainBody)) body: { domain: string }) {
    assertShopWritable(org);
    return this.settings.setDomain(org.id, body.domain, actorOf(auth, client));
  }

  @Post("shop/domain/verify")
  @HttpCode(200)
  verify(@CurrentOrg() org: OrgContext, @CurrentUser() auth: AuthContext, @Client() client: ClientContext) {
    assertShopWritable(org);
    return this.settings.verifyDomain(org.id, actorOf(auth, client));
  }
}

/** `PATCH /admin/organizations/{id}`: the administrator edits a shop (FR-ADM-09): the same fields and rules as the owner, and the own domain. The owner is told by email. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminShopSettingsController {
  constructor(@Inject(ShopSettingsService) private readonly settings: ShopSettingsService) {}

  @Patch("organizations/:id")
  async update(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(adminBody)) body: z.infer<typeof adminBody>) {
    const { customDomain, reason, ...fields } = body;
    const actor = actorOf(auth, client);
    const shop = await this.settings.update(id, fields as ShopSettingsInput, actor, { admin: true, reason });
    if (customDomain !== undefined) {
      const domain = await this.settings.setDomain(id, customDomain, actor, { admin: true });
      return { ...shop, customDomain: domain.domain || null, customDomainVerified: domain.verified };
    }
    return shop;
  }
}

/** Which shop an own domain belongs to, for the proxy and for the certificate check of the front server. A verified domain of an ACTIVE shop only. */
@Controller("public")
@PublicRoute()
export class PublicDomainController {
  constructor(@Inject(ShopSettingsService) private readonly settings: ShopSettingsService) {}

  @Get("domains/:host")
  lookup(@Param("host") host: string) {
    return this.settings.hostLookup(host);
  }

  /** The `ask` of the on-demand TLS of the front server (Caddy sends `?domain=`): 200 for a host the platform serves, 404 for any other. */
  @Get("tls/ask")
  @HttpCode(200)
  async tlsAsk(@Query("domain") domain = ""): Promise<Record<string, never>> {
    await this.settings.tlsAllowed(domain);
    return {};
  }
}
