import type { ZodError } from "zod";

/** Flatten Zod issues into `{ "path.to.field": messageKey }` (first issue per field wins). Messages are i18n keys. */
export function issuesToErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
