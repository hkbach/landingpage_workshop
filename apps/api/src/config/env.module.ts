import { Global, Module } from "@nestjs/common";
import { Secrets } from "../common/secrets";
import { parseEnv, type Env } from "./env";

export const ENV = Symbol("ENV");
export const SECRETS = Symbol("SECRETS");

/** The settings, parsed once (a wrong value stops the start). Inject with @Inject(ENV). */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv() }, { provide: SECRETS, useFactory: (env: Env) => new Secrets(env.APP_SECRET), inject: [ENV] }],
  exports: [ENV, SECRETS],
})
export class EnvModule {}
