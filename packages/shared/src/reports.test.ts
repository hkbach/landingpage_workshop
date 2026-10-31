import { describe, expect, it } from "vitest";
import {
  countReports, createReportSchema, filterReports, handleReportSchema, isReportReason, isReportStatus, type ReportRecord,
} from "./reports";

const ok = { reason: "SCAM", description: "They charged my card twice at the studio." };
const codes = (r: ReturnType<typeof createReportSchema.safeParse>) => (r.success ? [] : r.error.issues.map((i) => i.message));

describe("createReportSchema", () => {
  it("accepts a minimal anonymous report and a report with an email", () => {
    expect(createReportSchema.safeParse(ok).success).toBe(true);
    expect(createReportSchema.safeParse({ ...ok, email: "me@example.com" }).success).toBe(true);
    expect(createReportSchema.safeParse({ ...ok, email: "" }).success).toBe(true);
  });
  it("requires a known reason", () => {
    expect(codes(createReportSchema.safeParse({ description: ok.description }))).toContain("required");
    expect(codes(createReportSchema.safeParse({ ...ok, reason: "SPAM" }))).toContain("required");
  });
  it("needs a description of at least 10 characters (trimmed) and at most 2000", () => {
    expect(codes(createReportSchema.safeParse({ ...ok, description: "short" }))).toContain("descriptionShort");
    expect(codes(createReportSchema.safeParse({ ...ok, description: "   too short   " }))).toContain("descriptionShort");
    expect(createReportSchema.safeParse({ ...ok, description: "x".repeat(2000) }).success).toBe(true);
    expect(codes(createReportSchema.safeParse({ ...ok, description: "x".repeat(2001) }))).toContain("tooLong");
  });
  it("rejects a malformed or oversized email", () => {
    expect(codes(createReportSchema.safeParse({ ...ok, email: "not-an-email" }))).toContain("email");
    expect(codes(createReportSchema.safeParse({ ...ok, email: `${"a".repeat(120)}@example.com` }))).toContain("tooLong");
  });
  it("trims the text it keeps", () => {
    const r = createReportSchema.parse({ ...ok, description: "  Charged twice at the studio.  ", email: " me@example.com " });
    expect(r.description).toBe("Charged twice at the studio.");
    expect(r.email).toBe("me@example.com");
  });
});

describe("handleReportSchema", () => {
  it("only RESOLVED or DISMISSED, with an optional note up to 500 characters", () => {
    expect(handleReportSchema.safeParse({ status: "RESOLVED" }).success).toBe(true);
    expect(handleReportSchema.safeParse({ status: "DISMISSED", note: "Not a violation." }).success).toBe(true);
    expect(handleReportSchema.safeParse({ status: "OPEN" }).success).toBe(false);
    expect(handleReportSchema.safeParse({ status: "DELETED" }).success).toBe(false);
    expect(handleReportSchema.safeParse({ status: "RESOLVED", note: "x".repeat(501) }).success).toBe(false);
  });
});

const R = (id: string, o: Partial<ReportRecord>): ReportRecord => ({
  id, shopSlug: "clayco", reason: "SCAM", description: "desc", status: "OPEN", createdAt: "2026-10-01T00:00:00.000Z", ...o,
});
const sample: ReportRecord[] = [
  R("1", { createdAt: "2026-10-01T10:00:00.000Z", description: "Charged twice", reporterEmail: "Anna@Example.com" }),
  R("2", { createdAt: "2026-10-03T10:00:00.000Z", shopSlug: "waxwick", reason: "PHISHING", description: "Asked for a password" }),
  R("3", { createdAt: "2026-10-02T10:00:00.000Z", status: "RESOLVED", reason: "OTHER", description: "Wrong address" }),
  R("4", { createdAt: "2026-10-04T10:00:00.000Z", status: "DISMISSED", shopSlug: "silverthread", description: "Rude owner" }),
];
const ids = (rows: ReportRecord[]) => rows.map((r) => r.id).join(",");

describe("filterReports", () => {
  it("sorts newest first by default and oldest first on request", () => {
    expect(ids(filterReports(sample, {}))).toBe("4,2,3,1");
    expect(ids(filterReports(sample, { sort: "oldest" }))).toBe("1,3,2,4");
  });
  it("filters by status, reason and shop", () => {
    expect(ids(filterReports(sample, { status: "OPEN" }))).toBe("2,1");
    expect(ids(filterReports(sample, { reason: "OTHER" }))).toBe("3");
    expect(ids(filterReports(sample, { shop: "silverthread" }))).toBe("4");
    expect(ids(filterReports(sample, { status: "OPEN", shop: "clayco" }))).toBe("1");
  });
  it("searches description, reporter email and shop slug, ignoring case and spaces around", () => {
    expect(ids(filterReports(sample, { q: "CHARGED" }))).toBe("1");
    expect(ids(filterReports(sample, { q: "  anna@example  " }))).toBe("1");
    expect(ids(filterReports(sample, { q: "waxwick" }))).toBe("2");
    expect(ids(filterReports(sample, { q: "nothing like this" }))).toBe("");
    expect(ids(filterReports(sample, { q: "   " }))).toBe("4,2,3,1");
  });
  it("combines filters and never mutates its input", () => {
    const copy = [...sample];
    expect(ids(filterReports(sample, { status: "OPEN", q: "password" }))).toBe("2");
    expect(sample).toEqual(copy);
  });
});

describe("countReports and guards", () => {
  it("counts by status", () => {
    expect(countReports(sample)).toEqual({ total: 4, OPEN: 2, RESOLVED: 1, DISMISSED: 1 });
    expect(countReports([])).toEqual({ total: 0, OPEN: 0, RESOLVED: 0, DISMISSED: 0 });
  });
  it("isReportStatus / isReportReason accept only known values", () => {
    expect(isReportStatus("OPEN")).toBe(true);
    expect(isReportStatus("open")).toBe(false);
    expect(isReportReason("SCAM")).toBe(true);
    expect(isReportReason("OTHER ")).toBe(false);
    expect(isReportReason(undefined)).toBe(false);
  });
});
