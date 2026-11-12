import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ErrorFilter } from "./common/error.filter";
import { EnvModule } from "./config/env.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [EnvModule, DbModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ErrorFilter }],
})
export class AppModule {}
