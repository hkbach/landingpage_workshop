import { describe, expect, it } from "vitest";
import { checkAccountHolder, checkAccountNumber, checkBankName, maskAccountNumber, normalizeAccountNumber, normalizeBankName } from "./bank-details";

describe("bank name", () => {
  it("is trimmed and its runs of spaces made one", () => {
    expect(normalizeBankName("  Vietcombank   (VCB) ")).toBe("Vietcombank (VCB)");
  });
  it("accepts names in any language and the usual signs", () => {
    for (const ok of ["Vietcombank", "Ngân hàng TMCP Ngoại thương", "신한은행", "みずほ銀行", "招商银行", "Bank of America, N.A.", "Standard Chartered (Vietnam)", "AB-1 Bank & Co"]) expect(checkBankName(ok), ok).toBeNull();
  });
  it("refuses an empty, a too short, a too long and a name with other signs", () => {
    expect(checkBankName("   ")).toBe("required");
    expect(checkBankName("A")).toBe("invalid");
    expect(checkBankName("Bank <b>")).toBe("invalid");
    expect(checkBankName("Bank; drop table")).toBe("invalid");
    expect(checkBankName("B".repeat(101))).toBe("tooLong");
    expect(checkBankName("B".repeat(100))).toBeNull();
  });
});

describe("account holder", () => {
  it("follows the rules of a name: any language, apostrophes and hyphens, not empty, not too long", () => {
    for (const ok of ["Nguyễn Văn A", "O'Brien-Smith", "김민수", "山田 太郎", "王小明"]) expect(checkAccountHolder(ok), ok).toBeNull();
    expect(checkAccountHolder("  ")).toBe("required");
    expect(checkAccountHolder("A")).toBe("invalid");
    expect(checkAccountHolder("Bob <script>")).toBe("invalid");
    expect(checkAccountHolder("N".repeat(101))).toBe("tooLong");
  });
});

describe("account number", () => {
  it("loses the spaces and hyphens people type and is upper case", () => {
    expect(normalizeAccountNumber(" 0123 4567-89 ")).toBe("0123456789");
    expect(normalizeAccountNumber("gb82 west 1234 5698 7654 32")).toBe("GB82WEST12345698765432");
  });
  it("accepts 6 to 34 letters and digits", () => {
    for (const ok of ["012345", "0123 4567 89", "GB82 WEST 1234 5698 7654 32", "1".repeat(34)]) expect(checkAccountNumber(ok), ok).toBeNull();
  });
  it("refuses an empty, a short, a long one and one with other signs", () => {
    expect(checkAccountNumber("  ")).toBe("required");
    expect(checkAccountNumber("12345")).toBe("invalid");
    expect(checkAccountNumber("1234 5678 x!")).toBe("invalid");
    expect(checkAccountNumber("12345678.90")).toBe("invalid");
    expect(checkAccountNumber("1".repeat(35))).toBe("tooLong");
  });
  it("is masked to the last four characters", () => {
    expect(maskAccountNumber("0123456789")).toBe("****6789");
  });
});
