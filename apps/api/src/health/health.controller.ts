import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DB, type Database } from "../db/db.module";

/** `/health`: the process is up. `/ready`: it can reach its database (used by the container health check and by the proxy). Neither shows a version, a host or a setting. */
@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get("health")
  health(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<{ status: "ready" }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ code: "NOT_READY", message: "The database is not reachable." });
    }
    return { status: "ready" };
  }
}
