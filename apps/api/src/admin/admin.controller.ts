import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { Client, CurrentUser, PlatformAdminGuard } from "../auth/auth.guards";
import type { AuthContext, ClientContext } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { UuidPipe } from "../common/uuid.pipe";
import { ZodPipe } from "../common/zod.pipe";
import { AdminService, type UserType } from "./admin.service";

const page = { limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(300).optional() };
const text = (max: number) => z.string().trim().max(max).optional();
const orgListQuery = z.object({ q: text(100), status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED"]).optional(), ...page });
const userListQuery = z.object({ q: text(100), type: z.enum(["SUPER_ADMIN", "SHOP_OWNER", "CUSTOMER"]).optional(), status: z.enum(["UNVERIFIED", "ACTIVE", "DISABLED"]).optional(), ...page });
const auditQuery = z.object({ email: text(200), org: text(200), action: text(80), entityType: text(60), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), ...page });
// `show` is the older name of the field that the admin screens send: both are accepted.
const visibilityBody = z.object({ showOnCustomerPage: z.boolean({ error: "required" }).optional(), show: z.boolean({ error: "required" }).optional() })
  .refine((v) => v.showOnCustomerPage !== undefined || v.show !== undefined, { message: "required", path: ["showOnCustomerPage"] })
  .transform((v) => ({ showOnCustomerPage: (v.showOnCustomerPage ?? v.show)! }));
const orgStatusBody = z.object({ active: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() });
// The admin screens say DEACTIVATED, the database says DISABLED: both are accepted.
const userStatusBody = z.object({ status: z.enum(["ACTIVE", "DISABLED", "DEACTIVATED"], { error: "invalid" }).transform((v) => (v === "DEACTIVATED" ? ("DISABLED" as const) : v)), reason: z.string().trim().max(300, "tooLong").optional() });

const actorOf = (auth: AuthContext, client: ClientContext): Actor => ({ userId: auth.user.id, ip: client.ip });

/** `/api/v1/admin/*`: the platform administrator (SUPER_ADMIN) only. A shop owner or a customer gets 403, a visitor 401. */
@Controller("admin")
@UseGuards(PlatformAdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("organizations")
  organizations(@Query(new ZodPipe(orgListQuery)) q: { q?: string | undefined; status?: "DRAFT" | "ACTIVE" | "SUSPENDED" | undefined; limit: number; cursor?: string | undefined }) {
    return this.admin.listOrganizations(q);
  }

  @Get("organizations/:id")
  organization(@Param("id", new UuidPipe()) id: string) {
    return this.admin.getOrganization(id);
  }

  /** `{ active: false, reason }` suspends an ACTIVE shop; `{ active: true }` reactivates a SUSPENDED one. */
  @Post("organizations/:id/status")
  @HttpCode(200)
  organizationStatus(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(orgStatusBody)) body: { active: boolean; reason?: string | undefined }) {
    return this.admin.setOrganizationActive(id, body.active, body.reason, actorOf(auth, client));
  }

  /** `{ showOnCustomerPage }`: list (or stop listing) the workshops of the shop on the Workshops page of the customers. */
  @Post("organizations/:id/visibility")
  @HttpCode(200)
  organizationVisibility(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(visibilityBody)) body: { showOnCustomerPage: boolean }) {
    return this.admin.setVisibility(id, body.showOnCustomerPage, actorOf(auth, client));
  }

  @Get("users")
  users(@Query(new ZodPipe(userListQuery)) q: { q?: string | undefined; type?: UserType | undefined; status?: "UNVERIFIED" | "ACTIVE" | "DISABLED" | undefined; limit: number; cursor?: string | undefined }) {
    return this.admin.listUsers(q);
  }

  @Post("users/:id/status")
  @HttpCode(200)
  userStatus(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string, @Body(new ZodPipe(userStatusBody)) body: { status: "ACTIVE" | "DISABLED"; reason?: string | undefined }) {
    return this.admin.setUserStatus(id, body.status, body.reason, actorOf(auth, client));
  }

  @Post("users/:id/reset-password")
  @HttpCode(202)
  async resetPassword(@CurrentUser() auth: AuthContext, @Client() client: ClientContext, @Param("id", new UuidPipe()) id: string) {
    await this.admin.resetUserPassword(id, actorOf(auth, client));
    return { status: "ACCEPTED" };
  }

  @Get("audit-logs")
  auditLogs(@Query(new ZodPipe(auditQuery)) q: { email?: string | undefined; org?: string | undefined; action?: string | undefined; entityType?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    return this.admin.auditLogs(q);
  }
}
