import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException, SetMetadata, UnauthorizedException, UnprocessableEntityException, createParamDecorator } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { DB, type Database } from "../db/db.module";
import { organizationMembers, organizations } from "../db/schema";
import { ACT_AS_HEADER, ADMIN_REASON_HEADER, ADMIN_REASON_MAX, actingAllowed, reasonFromHeader } from "./act-as";
import { AuthService, type AuthContext, type ClientContext } from "./auth.service";
import { parseCookies } from "./cookies";

/** The shop (tenant) of the request: always the organization of the SESSION, never one the client names (CLAUDE.md: the tenant comes from the server context). */
export interface OrgContext { id: string; slug: string; name: string; status: "DRAFT" | "ACTIVE" | "SUSPENDED"; role: "OWNER" }

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    org?: OrgContext;
    /** Set when a platform administrator acts for the shop of `org` (see act-as.ts): the reason of the change. */
    actingFor?: { reason: string };
  }
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const PUBLIC_ROUTE = "publicRoute";
/**
 * Marks an endpoint of the PUBLIC site (the landing page of a shop: booking, report, contact). It never reads the session cookie, so another site cannot forge anything with it, and its
 * callers are the landing pages of every shop and every custom domain (each a different origin): the Origin check does not apply. Other protections (Turnstile, rate limits) do.
 */
export const PublicRoute = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

/**
 * CSRF (REQUIREMENTS 7.5), on top of SameSite=Lax: a request that changes something must come from the web app. The browser always sends `Origin` on such a request, so an `Origin`
 * of another site is refused. Without `Origin` (and `Referer`) only a request that carries NO session cookie is let through (a script or a tool: it has nothing to forge).
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: string;
  constructor(@Inject(ENV) private readonly env: Env, @Inject(Reflector) private readonly reflector: Reflector) {
    this.allowed = new URL(env.APP_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (!MUTATING.has(request.method)) return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
    const origin = request.headers.origin;
    let seen: string | undefined = typeof origin === "string" && origin !== "null" ? origin : undefined;
    if (!seen && typeof request.headers.referer === "string") {
      try {
        seen = new URL(request.headers.referer).origin;
      } catch {
        seen = undefined;
      }
    }
    if (seen) {
      if (seen === this.allowed) return true;
      throw new ForbiddenException({ code: "FORBIDDEN_ORIGIN", message: "This request does not come from the app." });
    }
    if (typeof origin === "string") throw new ForbiddenException({ code: "FORBIDDEN_ORIGIN", message: "This request does not come from the app." }); // Origin: null
    if (parseCookies(request.headers.cookie)[this.env.SESSION_COOKIE_NAME]) throw new ForbiddenException({ code: "FORBIDDEN_ORIGIN", message: "This request does not come from the app." });
    return true;
  }
}

/** Needs a valid session; puts it in `request.auth`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env, @Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (request.auth) return true;
    const session = await this.auth.authenticate(parseCookies(request.headers.cookie)[this.env.SESSION_COOKIE_NAME]);
    if (!session) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Please log in." });
    request.auth = session;
    return true;
  }
}

/** Needs a session AND a shop: loads the organization of the session and checks the person is still an active member of it. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(AuthGuard) private readonly authGuard: AuthGuard, @Inject(DB) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.authGuard.canActivate(context);
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const auth = request.auth;
    const actAs = request.headers[ACT_AS_HEADER];
    // A platform administrator acting for a shop: ONLY a SUPER_ADMIN (the header of anybody else is ignored, they stay in their own shop), only the routes of act-as.ts, and a reason for every change.
    if (typeof actAs === "string" && actAs.trim() !== "" && auth?.user.platformRole === "SUPER_ADMIN") return this.actFor(request, actAs.trim());
    if (!auth?.activeOrganizationId) throw new ForbiddenException({ code: "NO_ORGANIZATION", message: "This account has no shop." });
    const [row] = await this.db
      .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, status: organizations.status, role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, auth.user.id), eq(organizationMembers.organizationId, auth.activeOrganizationId), eq(organizationMembers.status, "ACTIVE")))
      .limit(1);
    if (!row) throw new ForbiddenException({ code: "NO_ORGANIZATION", message: "This account has no shop." });
    request.org = row;
    return true;
  }

  /** The administrator acts for the shop named in the header (its slug or id): the shop becomes `request.org`, as the owner's would. */
  private async actFor(request: FastifyRequest, shop: string): Promise<boolean> {
    if (!actingAllowed(request.method, request.url)) throw new ForbiddenException({ code: "ACT_AS_NOT_ALLOWED", message: "An administrator cannot do this for a shop." });
    const reason = reasonFromHeader(request.headers[ADMIN_REASON_HEADER]);
    if (MUTATING.has(request.method)) {
      if (!reason || reason.length > ADMIN_REASON_MAX) {
        throw new UnprocessableEntityException({ code: "ADMIN_REASON_REQUIRED", message: "A reason is required for a change made on behalf of a shop.", details: { fields: { reason: reason ? "tooLong" : "required" } } });
      }
    }
    const [row] = await this.db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name, status: organizations.status }).from(organizations)
      .where(UUID.test(shop) ? eq(organizations.id, shop) : eq(organizations.slug, shop.toLowerCase())).limit(1);
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });
    request.org = { ...row, role: "OWNER" };
    if (MUTATING.has(request.method)) request.actingFor = { reason };
    return true;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Needs a platform administrator (SUPER_ADMIN). */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@Inject(AuthGuard) private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.authGuard.canActivate(context);
    if (context.switchToHttp().getRequest<FastifyRequest>().auth?.user.platformRole !== "SUPER_ADMIN") throw new ForbiddenException({ code: "FORBIDDEN", message: "Administrators only." });
    return true;
  }
}

// ---- parameter decorators ---------------------------------------------------------------------------------------------------------------------------------

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const auth = context.switchToHttp().getRequest<FastifyRequest>().auth;
  if (!auth) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Please log in." });
  return auth;
});

/** The shop of the session (use behind TenantGuard). Never take a shop id from the body, the query or the path for tenant data. */
export const CurrentOrg = createParamDecorator((_data: unknown, context: ExecutionContext): OrgContext => {
  const org = context.switchToHttp().getRequest<FastifyRequest>().org;
  if (!org) throw new ForbiddenException({ code: "NO_ORGANIZATION", message: "This account has no shop." });
  return org;
});

export const Client = createParamDecorator((_data: unknown, context: ExecutionContext): ClientContext => {
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  const agent = request.headers["user-agent"];
  return { ip: request.ip || null, userAgent: typeof agent === "string" ? agent : null };
});
