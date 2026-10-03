import { describe, expect, it } from "vitest";
import {
  bonusCredit,
  canTransition,
  jobSchema,
  quote,
  roundSchema,
} from "../lib/domain";
import { csvCell } from "../lib/export";
import { hashPassword, verifyPassword } from "../lib/security";

describe("money and candidate protections", () => {
  it("preserves the stated candidate amount and adds an employer fee", () => {
    expect(quote(4500)).toEqual({
      amountCents: 4500,
      feeCents: 360,
      totalCents: 4860,
    });
  });
  it("rounds the fee to whole cents", () => {
    expect(quote(1501).feeCents).toBe(120);
  });
  it.each([499, 1000001, NaN, Infinity, 15.5, -1])(
    "rejects invalid money %s",
    (n) => expect(() => quote(n)).toThrow(),
  );
  it("never deducts salary and caps a proposed bonus credit", () => {
    expect(bonusCredit(15000, 10000)).toEqual({
      creditCents: 10000,
      remainingBonusCents: 0,
      salaryDeductionCents: 0,
    });
  });
  it("rejects negative bonus inputs", () =>
    expect(() => bonusCredit(-1, 100)).toThrow());
  it("does not permit an employer to accept for the candidate", () => {
    expect(canTransition("offered", "accept", "employer")).toBe(false);
    expect(canTransition("offered", "accept", "candidate")).toBe(true);
  });
  it("does not permit cancellation of a funded or completed round", () => {
    expect(canTransition("funded", "cancel", "employer")).toBe(false);
    expect(canTransition("paid", "complete", "candidate")).toBe(false);
  });
  it("requires an HTTPS meeting URL", () => {
    const d = {
      candidateEmail: "test@example.com",
      title: "Product designer",
      kind: "Introduction",
      minutes: 30,
      amountCents: 1500,
      scheduledAt: new Date().toISOString(),
      terms: "Review one project within the agreed scope.",
    };
    expect(
      roundSchema.safeParse({ ...d, meetingUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
  it("rejects an inverted salary range", () => {
    expect(
      jobSchema.safeParse({
        title: "Designer",
        location: "Remote",
        category: "Design",
        description: "A clear job with paid interviews and a fixed scope.",
        salaryMin: 100,
        salaryMax: 10,
        stages: 3,
      }).success,
    ).toBe(false);
  });
  it("escapes spreadsheet formula cells and quotes", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
  it("hashes each password with a distinct salt", async () => {
    const a = await hashPassword("a secure test password");
    const b = await hashPassword("a secure test password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("a secure test password", a)).toBe(true);
    expect(await verifyPassword("wrong password", a)).toBe(false);
  });
});
