import { loadDotEnv, parseEnv } from "../config/env";
import { presignUrl } from "./sigv4";

// `pnpm --filter api r2:check`: tries the settings of R2 with one tiny image: uploads it with a presigned URL, reads it back at the public address, and removes it. Prints what happened and
// never a key. Run it after setting R2_* in apps/api/.env.

loadDotEnv();
const env = parseEnv();
const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: keyId, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket, R2_PUBLIC_BASE_URL: base } = env;
if (!account || !keyId || !secret || !bucket || !base) {
  console.log("R2 is not set up: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL in apps/api/.env.");
  process.exit(1);
}

// A 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHQ6MJQAAAABJRU5ErkJggg==", "base64");
const key = `r2-check/${Date.now()}.png`;
const host = `${account}.r2.cloudflarestorage.com`;
const sign = (method: "PUT" | "DELETE", headers?: Record<string, string>) =>
  presignUrl({ method, host, path: `/${bucket}/${key}`, accessKeyId: keyId, secretAccessKey: secret, region: "auto", expiresSeconds: 120, now: new Date(), ...(headers ? { signedHeaders: headers } : {}) });

const hint = (status: number): string =>
  status === 403 ? "403: the key is wrong, or it cannot write to this bucket (the token needs Object Read & Write on the bucket)."
    : status === 404 ? "404: the bucket name or the account id is wrong." : `${status}: unexpected answer.`;

async function main(): Promise<void> {
  const put = await fetch(sign("PUT", { "content-type": "image/png" }), { method: "PUT", headers: { "content-type": "image/png" }, body: PNG });
  console.log(`1. upload with a presigned URL: ${put.ok ? "OK" : "FAILED " + hint(put.status)}`);
  if (!put.ok) process.exit(1);
  const url = `${base!.replace(/\/+$/, "")}/${key}`;
  const read = await fetch(url);
  const same = read.ok && Buffer.from(await read.arrayBuffer()).equals(PNG);
  console.log(`2. read at the public address (${new URL(url).host}): ${same ? "OK" : `FAILED (${read.status}): turn on "Public Development URL" (r2.dev) in the settings of the bucket, and check R2_PUBLIC_BASE_URL.`}`);
  const del = await fetch(sign("DELETE"), { method: "DELETE" });
  console.log(`3. remove the test file: ${del.ok ? "OK" : `not removed (${del.status}); delete ${key} in the dashboard`}`);
  // The browser asks the bucket first (a "preflight") whether the web app may PUT there: the same question, asked from here, with the address of the web app as the origin.
  const origin = new URL(env.APP_URL).origin;
  const pre = await fetch(`https://${host}/${bucket}/${key}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": "content-type" } });
  const allowed = pre.headers.get("access-control-allow-origin");
  const methods = pre.headers.get("access-control-allow-methods") ?? "";
  const cors = pre.ok && (allowed === origin || allowed === "*") && methods.toUpperCase().includes("PUT");
  console.log(`4. CORS for ${origin}: ${cors ? "OK" : `NOT SET (${pre.status}). Add this origin and the PUT method to the CORS policy of the bucket (docs/RUNBOOK.md).`}`);
  if (!cors) process.exitCode = 1;
  if (!same) process.exit(1);
}
main().catch((e: unknown) => { console.log(`FAILED: ${e instanceof Error ? e.message : "network error"}`); process.exit(1); });
