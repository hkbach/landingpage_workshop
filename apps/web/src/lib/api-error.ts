/** Error body of every API response (REQUIREMENTS 7.5): { error: { code, message, details } }. */
export function apiError(status: number, code: string, message: string, details: Record<string, unknown> = {}, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message, details } }, { status, ...(headers ? { headers } : {}) });
}

/** `details.fields` of a validation error: one code per field, the first problem found for it. */
export function fieldCodes(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "body")] ??= i.message;
  return out;
}
