/**
 * Whether the guest area (/customer/{id}) asks the guest to log in. While the prototype is only being tested it does not: the area opens by its address, and the
 * API answers for the id alone. Set CUSTOMER_LOGIN_REQUIRED=true to ask for the login again (the guest must be logged in with the email of the account). In
 * production the login is ALWAYS required, whatever the variable says, so the accounts of the guests can never be opened by guessing an id.
 * TODO(api): remove the switch when the guest session is a cookie checked by the server.
 */
export function customerLoginRequired(): boolean {
  return process.env.NODE_ENV === "production" || process.env.CUSTOMER_LOGIN_REQUIRED === "true";
}
