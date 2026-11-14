import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { mergeMap } from "rxjs";
import { actingKind, routePath } from "../auth/act-as";
import { AdminActionsService } from "./admin-actions.service";

/**
 * After a CHANGE that a platform administrator made for a shop through the pages of the shop owner (see auth/act-as.ts) went through: the audit line with the REASON (the services already wrote their
 * own line, with the administrator as the actor) and the email to the owners of the shop saying what was changed and why (D15). A change that failed writes and sends nothing.
 */
@Injectable()
export class ActingInterceptor implements NestInterceptor {
  constructor(@Inject(AdminActionsService) private readonly actions: AdminActionsService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== "http") return next.handle();
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    return next.handle().pipe(mergeMap(async (value: unknown) => {
      const { actingFor, org, auth } = request;
      if (actingFor && org && auth) {
        const kind = actingKind(request.url);
        const id = (request.params as Record<string, string> | undefined)?.id ?? org.id;
        const action = `${request.method} ${routePath(request.url).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")}`;
        await this.actions.done(org, { userId: auth.user.id, ip: request.ip || null }, actingFor.reason, { type: kind === "SESSION_CHANGED" ? "session" : "workshop", id }, action, { kind, detail: "" });
      }
      return value;
    }));
  }
}
