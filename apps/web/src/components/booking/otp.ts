// The email code that confirms a booking. The server sends it (outbox + worker), keeps only a keyed hash with an expiry, limits resends and wrong attempts per email and per IP, and checks it
// when the booking is made (the code goes with the booking: it cannot be tried apart). The sample data of the web app accepts DEMO_OTP only.
export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 30;
/** The only code the sample data accepts (nothing is emailed there). */
export const DEMO_OTP = "123456";

/** What the guest typed, reduced to digits and cut to the code length. */
export const cleanOtp = (raw: string): string => raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
export const isOtpComplete = (code: string): boolean => code.length === OTP_LENGTH && /^\d+$/.test(code);

/** Asks the server to email a code to the guest (`POST /public/sites/{slug}/booking-otp`; the answer is the same for any email). Throws when the server refuses (a limit, a check that failed). */
export async function sendOtp(slug: string, email: string, locale: string): Promise<void> {
  const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/booking-otp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, locale }) });
  if (!res.ok) throw new Error(`booking-otp ${res.status}`);
}
