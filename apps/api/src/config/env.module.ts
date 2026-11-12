import { Global, Module } from "@nestjs/common";
import { parseEnv } from "./env";

export const ENV = Symbol("ENV");

/** The settings, parsed once (a wrong value stops the start). Inject with @Inject(ENV). */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv() }],
  exports: [ENV],
})
export class EnvModule {}
