import { Controller, Get, Inject, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AuditService, isAuditCursor } from "../audit/audit.service";
import { CurrentOrg, TenantGuard, type OrgContext } from "../auth/auth.guards";
import { ZodPipe } from "../common/zod.pipe";
import { DB, type Database } from "../db/db.module";
import { organizations } from "../db/schema";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

/** A cursor is `<time to the microsecond>|<id>` in base64url. A cursor that does not decode is a 400, never a guess. */
function decodeCursor(cursor: string): { ts: string; id: string } {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!isAuditCursor(ts, id)) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
  return { ts: ts!, id: id! };
}

/** The first tenant endpoints: the shop of the session and its audit log. They prove the pattern every later endpoint follows (TenantGuard + CurrentOrg + tenantScope). */
@Controller()
@UseGuards(TenantGuard)
export class OrganizationController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  @Get("organization")
  async organization(@CurrentOrg() org: OrgContext) {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.id, org.id)).limit(1);
    return row;
  }

  /** The audit log of THIS shop (REQUIREMENTS 5.8: the shop owner reads the log of the shop), newest first, with a cursor. */
  @Get("audit-logs")
  async auditLogs(@CurrentOrg() org: OrgContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const rows = await this.audit.listForOrganization(org.id, query.limit, query.cursor ? decodeCursor(query.cursor) : undefined);
    const items = rows.slice(0, query.limit).map(({ a: r }) => ({ id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, createdAt: r.createdAt.toISOString(), actorUserId: r.actorUserId }));
    const last = rows.length > query.limit ? rows[query.limit - 1] : undefined;
    return { items, nextCursor: last ? Buffer.from(`${last.ts}|${last.a.id}`).toString("base64url") : null };
  }
}
