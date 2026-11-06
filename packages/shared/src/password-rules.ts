// The password of an account (shop owner or customer): 10 to 72 characters (72 is the most a bcrypt-style hash reads). The same rule is checked by the forms and the server.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export type PasswordCheck = "OK" | "TOO_SHORT" | "TOO_LONG";

export function checkPassword(password: string): PasswordCheck {
  if (password.length < PASSWORD_MIN) return "TOO_SHORT";
  return password.length > PASSWORD_MAX ? "TOO_LONG" : "OK";
}
