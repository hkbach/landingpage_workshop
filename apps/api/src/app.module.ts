import { type DynamicModule, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuditService } from "./audit/audit.service";
import { BookingsController, CustomersController } from "./bookings/bookings.controller";
import { BookingsService } from "./bookings/bookings.service";
import { CustomersService } from "./bookings/customers.service";
import { PublicController } from "./bookings/public.controller";
import { PublicBookingsService } from "./bookings/public-bookings.service";
import { SessionCapacityService } from "./bookings/session-capacity.service";
import { ScheduleService } from "./catalog/schedule.service";
import { ScheduleRulesController, SessionsController } from "./catalog/sessions.controller";
import { SessionsService } from "./catalog/sessions.service";
import { WorkshopsController } from "./catalog/workshops.controller";
import { WorkshopsService } from "./catalog/workshops.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard, OriginGuard, PlatformAdminGuard, TenantGuard } from "./auth/auth.guards";
import { AuthService } from "./auth/auth.service";
import { TurnstileService } from "./auth/turnstile.service";
import { ErrorFilter } from "./common/error.filter";
import { ENV, EnvModule } from "./config/env.module";
import type { Env } from "./config/env";
import { DbModule } from "./db/db.module";
import { createEmailProvider, EMAIL_PROVIDER, type EmailProvider } from "./email/email";
import { HealthController } from "./health/health.controller";
import { createJobs, JOBS, type JobsPort } from "./jobs/jobs";
import { MaintenanceService } from "./jobs/maintenance";
import { OrganizationController } from "./organization/organization.controller";
import { SitePagesController } from "./site/site-pages.controller";
import { SitePagesService } from "./site/site-pages.service";
import { OutboxService } from "./outbox/outbox.service";

/** What a test (or another entry point) may replace: how emails leave and how the worker is woken. */
export interface AppOptions { emailProvider?: EmailProvider; jobs?: JobsPort }

/** The services of the business (shared by the API and the worker). */
export const CORE_PROVIDERS = [AuditService, OutboxService];

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject(JOBS) private readonly jobs: JobsPort) {}

  static forRoot(options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [EnvModule, DbModule],
      controllers: [HealthController, AuthController, OrganizationController, WorkshopsController, SessionsController, ScheduleRulesController, PublicController, BookingsController, CustomersController, SitePagesController],
      providers: [
        { provide: EMAIL_PROVIDER, inject: [ENV], useFactory: (env: Env) => options.emailProvider ?? createEmailProvider(env) },
        { provide: JOBS, inject: [ENV], useFactory: (env: Env) => options.jobs ?? createJobs(env) },
        ...CORE_PROVIDERS, WorkshopsService, SessionsService, ScheduleService, MaintenanceService, SessionCapacityService, PublicBookingsService, BookingsService, CustomersService, SitePagesService, AuthService, TurnstileService, AuthGuard, TenantGuard, PlatformAdminGuard,
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: OriginGuard },
      ],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.jobs.stop();
  }
}
