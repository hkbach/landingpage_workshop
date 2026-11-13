// What may reach a log line. A log is read by people and kept by other systems, so it never carries a secret, a token, a password, a cookie, a presigned URL, an email address or the
// values of a failed query (the message of a database error repeats them: `params: ...`). Everything here is applied to text that is ABOUT to be logged; it cannot make a log safe
// that was already written, so the code must still not log such values on purpose.

/** Marks an id that is set aside while the other rules run (a character that never appears in a log). */
const MARK = String.fromCharCode(0xe000);
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** A path of the API for a log line: no query string (it can hold a token or a signature) and no segment that looks like a secret (a long token); ids stay, they are not secrets. */
export function scrubUrl(url: string): string {
  const path = url.split("?")[0] ?? "";
  return path.split("/").map((segment) => (segment.length >= 24 && !/^[0-9a-f-]{36}$/i.test(segment) ? ":token" : segment)).join("/");
}

/** Text that is about to be logged (an error message, a stack): the values of a query, connection strings, emails, tokens, encrypted values and presigned URLs are hidden. */
export function scrubLog(text: string): string {
  const ids: string[] = [];
  return text
    .replace(UUID, (id) => `${MARK}${ids.push(id) - 1}${MARK}`) // an id is useful to find the row and is not a secret: keep it through the next rules
    .replace(/params:[^\n]*/gi, "params: [hidden]")
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgres://[hidden]")
    .replace(/https?:\/\/[^\s'"]*[?&](?:X-Amz-[A-Za-z-]+|signature|token|sig|key)=[^\s'"]*/gi, "[presigned-url]")
    .replace(/enc:v1:[A-Za-z0-9_:-]+/g, "[encrypted]")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [hidden]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(new RegExp(`${MARK}([0-9]+)${MARK}`, "g"), (_m, i: string) => ids[Number(i)] ?? "");
}
