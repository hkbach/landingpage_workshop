import { z } from "zod";

// The bodies of the auth endpoints. Every text is trimmed (BR-16) and an email is lowercased; the codes of the errors ("required", "invalid", "tooLong") are the ones the forms already
// know. TODO(shared): move to packages/shared when the web app calls these endpoints, so the forms and the server use one schema.
const email = z.string({ error: "required" }).trim().toLowerCase().min(1, "required").max(254, "tooLong").pipe(z.email("invalid"));
const password = z.string({ error: "required" }).min(1, "required").max(200, "tooLong"); // the strength is checked in the service with checkPassword
const turnstileToken = z.string().trim().max(2048).optional();
const token = z.string({ error: "required" }).trim().min(20, "invalid").max(200, "invalid");

const accountFields = { email, password, confirmPassword: password, turnstileToken };

export const signupSchema = z.discriminatedUnion("type", [
  // `inviteCode`: the code of the invite link the friend came through; a wrong one is ignored, never an error
  z.object({ type: z.literal("CUSTOMER"), ...accountFields, inviteCode: z.string().trim().max(20).optional() }),
  z.object({ type: z.literal("SHOP_OWNER"), ...accountFields, shopName: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong") }),
], { error: "invalid" });

export const loginSchema = z.object({ email, password });
export const verifyEmailSchema = z.object({ token });
export const emailOnlySchema = z.object({ email, turnstileToken });
export const resetPasswordSchema = z.object({ token, password, confirmPassword: password });

export type SignupInput = z.infer<typeof signupSchema>;
