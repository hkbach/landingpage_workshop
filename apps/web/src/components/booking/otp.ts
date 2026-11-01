// Frontend-only simulation of the email OTP that confirms a booking (no API in this milestone). The real API sends the code by email
// (outbox + worker), stores only its hash with an expiry, and limits resends and wrong attempts per email and per IP.
export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 30;
/** The only code the mock accepts: nothing is emailed from this milestone. */
export const DEMO_OTP = "123456";

/** What the guest typed, reduced to digits and cut to the code length. */
export const cleanOtp = (raw: string): string => raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
export const isOtpComplete = (code: string): boolean => code.length === OTP_LENGTH && /^\d+$/.test(code);

export async function sendOtp(email: string): Promise<void> {
  void email;
  await new Promise((r) => setTimeout(r, 400));
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  void email;
  await new Promise((r) => setTimeout(r, 400));
  return code === DEMO_OTP;
}
