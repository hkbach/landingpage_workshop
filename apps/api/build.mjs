// Bundles the API, the worker and the two maintenance commands (migrate, encrypt-bank) into dist/ (ES modules). The dependencies stay in node_modules (they are installed where the API runs); only our own code and the shared
// rules of packages/shared (TypeScript source) are bundled. Decorator metadata is not needed: every injection names its token with @Inject.
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";
import { URL } from "node:url";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
// @workshop/shared is TypeScript source (it has no build): it is always bundled, never left for node to load.
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => name !== "@workshop/shared");

rmSync("dist", { recursive: true, force: true });
await build({
  entryPoints: { main: "src/main.ts", "main.worker": "src/main.worker.ts", migrate: "src/db/migrate.ts", "encrypt-bank": "src/db/encrypt-bank-accounts.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external: [...external, ...external.map((n) => `${n}/*`), "@nestjs/microservices", "@nestjs/websockets", "@nestjs/platform-express", "class-transformer", "class-validator"],
  // The tsconfig of the package carries experimentalDecorators, which esbuild reads.
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
