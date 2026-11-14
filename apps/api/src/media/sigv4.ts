import { createHash, createHmac } from "node:crypto";

// A presigned URL of the S3 API (AWS Signature Version 4, "query string" form), written with node:crypto so that no SDK is needed. Cloudflare R2 speaks this API (region "auto").

export interface PresignInput {
  method: "GET" | "PUT" | "DELETE";
  /** `account.r2.cloudflarestorage.com` for R2. */
  host: string;
  /** The path with its leading slash, not yet encoded (R2: `/bucket/key`). */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  expiresSeconds: number;
  now: Date;
  /** Headers the request MUST send with exactly these values (they are signed): the content type of an upload. */
  signedHeaders?: Record<string, string>;
  /** Query parameters of the request itself (the listing of a bucket: `list-type`, `prefix`, ...); they are signed with the others. */
  query?: Record<string, string>;
}

const sha256 = (data: string): string => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string): Buffer => createHmac("sha256", key).update(data).digest();
/** The encoding of the S3 signature: everything but A-Z a-z 0-9 - _ . ~ is %XX (and `/` stays in a path). */
const encode = (value: string, keepSlash = false): string =>
  [...Buffer.from(value, "utf8")].map((b) => {
    const c = String.fromCharCode(b);
    return /[A-Za-z0-9\-_.~]/.test(c) || (keepSlash && c === "/") ? c : `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
  }).join("");

/** The full URL, signature included. */
export function presignUrl(input: PresignInput): string {
  const service = input.service ?? "s3";
  const iso = input.now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // 20130524T000000Z
  const date = iso.slice(0, 8);
  const scope = `${date}/${input.region}/${service}/aws4_request`;
  const headers: Record<string, string> = { host: input.host };
  for (const [k, v] of Object.entries(input.signedHeaders ?? {})) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const query: Record<string, string> = {
    ...(input.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": names.join(";"),
  };
  const canonicalQuery = Object.keys(query).sort().map((k) => `${encode(k)}=${encode(query[k]!)}`).join("&");
  const canonicalPath = encode(input.path, true);
  const canonicalRequest = [input.method, canonicalPath, canonicalQuery, ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", iso, scope, sha256(canonicalRequest)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");
  return `https://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
