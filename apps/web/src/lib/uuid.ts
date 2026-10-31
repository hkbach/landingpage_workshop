/**
 * RFC 4122 v4 UUID. `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost), so on plain-http dev hosts
 * such as http://app.localtest.me it is undefined; `crypto.getRandomValues` is available everywhere.
 */
export function newUuid(cryptoImpl: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto): string {
  if (typeof cryptoImpl.randomUUID === "function") return cryptoImpl.randomUUID();
  const b = cryptoImpl.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
