import { eq, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * The condition every query of tenant data must carry: `where(tenantScope(table, org.id), ...)`. The organization comes from the session (`@CurrentOrg()`), never from the request.
 * Tenant tables (workshops, sessions, bookings...) all have an `organization_id` column, which is what this reads.
 */
export function tenantScope(table: { organizationId: AnyColumn }, organizationId: string): SQL {
  return eq(table.organizationId, organizationId);
}
