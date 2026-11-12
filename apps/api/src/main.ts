import "reflect-metadata";
import { createApp } from "./app";
import { loadDotEnv, parseEnv } from "./config/env";

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const env = parseEnv();
  const app = await createApp(env);
  // Only the local machine can reach it in development; in production the reverse proxy is the way in.
  await app.listen(env.API_PORT, env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
}

bootstrap().catch((error: unknown) => {
  // A wrong setting names the setting, never its value (see config/env.ts).
  console.error(error instanceof Error ? error.message : "The API could not start.");
  process.exit(1);
});
