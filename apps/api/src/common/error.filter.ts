import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { scrubLog, scrubUrl } from "./log-scrub";

/** The error body of every endpoint (REQUIREMENTS 7.5): `{ "error": { "code", "message", "details" } }`. */
export interface ErrorBody { error: { code: string; message: string; details: Record<string, unknown>; requestId?: string } }

const CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION", 429: "RATE_LIMITED", 503: "UNAVAILABLE",
};

/** Turns anything thrown into the standard body. A validation error is 422 with `details.fields`; an unexpected error is a plain 500 (its text and stack stay in the log, never in the answer). */
export function toErrorBody(exception: unknown, requestId?: string): { status: number; body: ErrorBody } {
  const withId = requestId ? { requestId } : {};
  if (exception instanceof ZodError) {
    const fields = Object.fromEntries(exception.issues.map((i) => [i.path.join(".") || "body", i.message]));
    return { status: 422, body: { error: { code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields }, ...withId } } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const res = exception.getResponse();
    const obj = typeof res === "object" && res !== null ? (res as Record<string, unknown>) : {};
    const { code, message, details, statusCode: _s, error: _e, ...rest } = obj;
    void _s; void _e;
    const text = typeof message === "string" ? message : typeof res === "string" ? res : exception.message;
    return {
      status,
      body: { error: { code: typeof code === "string" ? code : (CODE_BY_STATUS[status] ?? "ERROR"), message: text, details: (details as Record<string, unknown> | undefined) ?? rest, ...withId } },
    };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: { error: { code: "INTERNAL", message: "Something went wrong. Please try again.", details: {}, ...withId } } };
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("Error");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const { status, body } = toErrorBody(exception, request.id);
    if (status >= 500) this.logger.error(`${request.method} ${scrubUrl(request.url)} -> ${status} (request ${request.id})`, scrubLog(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)));
    void reply.status(status).header("cache-control", "no-store").send(body);
  }
}
