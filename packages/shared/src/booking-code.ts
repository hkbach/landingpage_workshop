// The code of a booking is made from the code of its session: "<session code>-<3 digits>", for example "SES-0003-042". The digits count the
// bookings of that session (001, 002, ...), so the code tells the owner which session a guest booked, and it is unique in the shop.

/** A booking code: a session code ("SES-0003") and at least 3 digits. */
export const BOOKING_CODE_RE = /^SES-[0-9]{4,}-[0-9]{3,}$/;

/** The number a booking code ends with, or null for anything that is not a booking code of that session. */
function suffixOf(code: string, sessionCode: string): number | null {
  if (!BOOKING_CODE_RE.test(code) || !code.startsWith(`${sessionCode}-`)) return null;
  return Number(code.slice(sessionCode.length + 1));
}

/**
 * The next booking code of a session: one more than the highest number used so far for that session (`taken` are the codes already given, of
 * any session), and never below `atLeast`. The first booking of "SES-0003" is "SES-0003-001".
 */
export function nextBookingCode(sessionCode: string, taken: readonly string[], atLeast = 1): string {
  const highest = taken.reduce((max, c) => Math.max(max, suffixOf(c, sessionCode) ?? 0), 0);
  return `${sessionCode}-${String(Math.max(highest + 1, atLeast)).padStart(3, "0")}`;
}
