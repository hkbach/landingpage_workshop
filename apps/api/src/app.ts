import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, type AppOptions } from "./app.module";
import type { Env } from "./config/env";

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Builds the Nest + Fastify application. Every request gets an id (the client's `x-request-id` when it is a plain token, a new one otherwise) that is in the log lines, in the
 * error body and in the `x-request-id` answer header. The log never carries the cookie, the authorization header or a set-cookie.
 */
export async function createApp(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV"> & Partial<Pick<Env, "TRUST_PROXY_HOPS">>, options: AppOptions = {}): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: { level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'] },
    genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
      const sent = req.headers["x-request-id"];
      return typeof sent === "string" && REQUEST_ID.test(sent) ? sent : randomUUID();
    },
    bodyLimit: 1_048_576,
    // How many reverse proxies stand in front (Caddy): request.ip is then the address the nearest one saw, never a header the client wrote. 0 = none: the socket.
    trustProxy: (env.TRUST_PROXY_HOPS ?? 0) > 0 ? (_address: string, hop: number) => hop < (env.TRUST_PROXY_HOPS ?? 0) : false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(options), adapter, { bufferLogs: true, ...(env.NODE_ENV === "test" ? { logger: false } : {}) });
  const production = env.NODE_ENV === "production";
  app.getHttpAdapter().getInstance().addHook("onSend", async (request, reply) => {
    void reply.header("x-request-id", request.id);
    // An API answer is data for the web app, never a page: no sniffing, no framing, no referrer, nothing cached by a shared cache (it can hold personal data), and HTTPS only in production.
    void reply.header("x-content-type-options", "nosniff");
    void reply.header("referrer-policy", "no-referrer");
    void reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    void reply.header("cross-origin-resource-policy", "same-site");
    if (!reply.hasHeader("cache-control")) void reply.header("cache-control", "no-store");
    if (production) void reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    reply.removeHeader("x-powered-by");
  });
  // The endpoints of the product are under /api/v1; the checks of the infrastructure are not.
  app.setGlobalPrefix("api/v1", { exclude: ["health", "ready"] });
  app.enableShutdownHooks();
  return app;
}
