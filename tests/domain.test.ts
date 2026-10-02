import { describe, expect, it } from "vitest";
import {
  bonusCredit,
  canTransition,
  jobSchema,
  quote,
  roundSchema,
} from "../lib/domain";
import { mutateDemo, seedDemo } from "../lib/demo";
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
  it("needs both confirmations before release", () => {
    let d = seedDemo();
    const r = d.rounds[0];
    expect(() => mutateDemo(d, "employer", `rounds/${r.id}/release`)).toThrow();
    d = mutateDemo(d, "employer", `rounds/${r.id}/complete`);
    expect(d.rounds[0].status).toBe("funded");
    d = mutateDemo(d, "candidate", `rounds/${r.id}/complete`);
    d = mutateDemo(d, "employer", `rounds/${r.id}/release`);
    expect(d.rounds[0].status).toBe("paid");
    expect(d.ledger[0].amountCents).toBe(4500);
  });
  it("blocks release after a dispute", () => {
    const d = seedDemo();
    const disputed = mutateDemo(
      d,
      "candidate",
      `rounds/${d.rounds[0].id}/dispute`,
      { reason: "The agreed interview scope was not met." },
    );
    expect(() =>
      mutateDemo(disputed, "employer", `rounds/${d.rounds[0].id}/release`),
    ).toThrow();
  });
  it("rejects completion before the round ends", () => {
    const d = seedDemo();
    d.rounds[0].scheduledAt = new Date(Date.now() + 86400000).toISOString();
    expect(() =>
      mutateDemo(d, "candidate", `rounds/${d.rounds[0].id}/complete`),
    ).toThrow();
  });
  it("does not mutate the source demo state", () => {
    const d = seedDemo();
    const next = mutateDemo(d, "candidate", `rounds/${d.rounds[1].id}/accept`);
    expect(d.rounds[1].status).toBe("offered");
    expect(next.rounds[1].status).toBe("accepted");
  });
  it("requires an HTTPS meeting URL", () => {
    const d = seedDemo().rounds[0];
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
