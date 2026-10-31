/** Error body of every API response (REQUIREMENTS 7.5): { error: { code, message, details } }. */
export function apiError(status: number, code: string, message: string, details: Record<string, unknown> = {}, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message, details } }, { status, ...(headers ? { headers } : {}) });
}
