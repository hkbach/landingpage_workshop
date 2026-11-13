// The bank details a customer types when asking to withdraw money (D22): the name of the bank and the number of the account, so an administrator can pay the invoice outside the system. The web
// popup and the API use the same rules. These are personal data: they are shown only to the account owner (the number masked) and to the platform administrator who pays, never logged and
// never written to the audit log.

export const BANK_NAME_MAX = 100;
export const BANK_NAME_MIN = 2;
export const ACCOUNT_NUMBER_MIN = 6;
export const ACCOUNT_NUMBER_MAX = 34; // the longest IBAN

/** The bank name as it is kept: trimmed (BR-16) and with every run of spaces made one. */
export const normalizeBankName = (value: string): string => value.replace(/\s+/g, " ").trim();

/** The name of the owner of the account, as it is kept: like the bank name (trimmed, runs of spaces made one). */
export const normalizeAccountHolder = normalizeBankName;

/** The account number as it is kept: spaces and hyphens (people type "0123 4567-89") removed, letters upper case (an IBAN has letters). */
export const normalizeAccountNumber = (value: string): string => value.replace(/[\s-]+/g, "").toUpperCase();

export type BankFieldIssue = "required" | "invalid" | "tooLong";

/** Why a bank name cannot be used, or null. Letters of any language, digits, spaces and . , ' & ( ) / - only. */
export function checkBankName(raw: string): BankFieldIssue | null {
  const name = normalizeBankName(raw);
  if (!name) return "required";
  if ([...name].length > BANK_NAME_MAX) return "tooLong";
  if ([...name].length < BANK_NAME_MIN || !/^[\p{L}\p{N} .,'&()/-]+$/u.test(name)) return "invalid";
  return null;
}

/** Why the name of the account owner cannot be used, or null: the same rules as a bank name (letters of any language, digits, spaces and . , ' & ( ) / -), 2 to 100 characters. */
export const checkAccountHolder = checkBankName;

/** Why an account number cannot be used, or null: 6 to 34 letters or digits once the spaces and hyphens are removed. */
export function checkAccountNumber(raw: string): BankFieldIssue | null {
  const number = normalizeAccountNumber(raw);
  if (!number) return "required";
  if (number.length > ACCOUNT_NUMBER_MAX) return "tooLong";
  return /^[A-Z0-9]+$/.test(number) && number.length >= ACCOUNT_NUMBER_MIN ? null : "invalid";
}

/** The number for a place that is not the one who needs it: "****6789" (the last four characters). */
export const maskAccountNumber = (number: string): string => `****${number.slice(-4)}`;
