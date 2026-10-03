import { z } from "zod";

export const roundKinds = [
  "Introduction",
  "Skills interview",
  "Work sample",
] as const;
export type Role = "employer" | "candidate";
export type Currency = "USD" | "INR";
export type RoundStatus =
  | "offered"
  | "accepted"
  | "funded"
  | "completed"
  | "paid"
  | "disputed"
  | "cancelled";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  company: string;
  bio: string;
  country: string;
  verified: boolean;
  connectId?: string;
  connectReady?: boolean;
  razorpayReady?: boolean;
  headline?: string;
  skills?: string[];
  portfolioUrl?: string;
  resumeUrl?: string;
  timezone?: string;
}
export interface Job {
  id: string;
  employerId: string;
  company: string;
  title: string;
  location: string;
  category: string;
  description: string;
  salaryMin: number;
  salaryMax: number;
  stages: number;
  status: "open" | "closed";
  currency?: Currency;
  createdAt: string;
}
export interface Application {
  id: string;
  jobId: string;
  candidateId: string;
  candidateName: string;
  email: string;
  note: string;
  status: string;
  createdAt: string;
  jobTitle?: string;
  headline?: string;
  skills?: string[];
  portfolioUrl?: string;
  resumeUrl?: string;
}
export interface Round {
  id: string;
  employerId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  company: string;
  title: string;
  kind: (typeof roundKinds)[number];
  minutes: number;
  amountCents: number;
  feeCents: number;
  scheduledAt: string;
  meetingUrl: string;
  terms: string;
  status: RoundStatus;
  employerConfirmed: boolean;
  candidateConfirmed: boolean;
  createdAt: string;
  currency?: Currency;
  paymentProvider?: "stripe" | "razorpay";
}
export interface LedgerEntry {
  id: string;
  roundId: string;
  type: string;
  amountCents: number;
  createdAt: string;
  currency?: Currency;
}
export interface Dispute {
  id: string;
  roundId: string;
  reason: string;
  status: string;
  createdAt: string;
}
export interface Workspace {
  user: User;
  rounds: Round[];
  jobs: Job[];
  applications: Application[];
  ledger: LedgerEntry[];
  disputes: Dispute[];
}

export const defaults = [
  { kind: roundKinds[0], minutes: 30, cents: 1500 },
  { kind: roundKinds[1], minutes: 60, cents: 4500 },
  { kind: roundKinds[2], minutes: 90, cents: 9000 },
];
export const plans = [
  { name: "Launch", monthlyCents: 0, bps: 800 },
  { name: "Team", monthlyCents: 7900, bps: 500 },
  { name: "Scale", monthlyCents: 24900, bps: 300 },
];
export function quote(amountCents: number, bps = 800) {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 500 ||
    amountCents > 1000000
  )
    throw new Error(
      "The round amount must be between 5 and 10,000 currency units.",
    );
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000)
    throw new Error("The fee rate is not valid.");
  const feeCents = Math.round((amountCents * bps) / 10000);
  return { amountCents, feeCents, totalCents: amountCents + feeCents };
}
export function bonusCredit(interviewCents: number, bonusCents: number) {
  if (
    ![interviewCents, bonusCents].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw new Error("The amounts must be positive whole cents.");
  const creditCents = Math.min(interviewCents, bonusCents);
  return {
    creditCents,
    remainingBonusCents: bonusCents - creditCents,
    salaryDeductionCents: 0,
  };
}
export function money(cents: number, currency: Currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

const name = z.string().trim().min(2).max(100);
export const registerSchema = z.object({
  name,
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["employer", "candidate"]),
  company: z.string().trim().max(100).default(""),
});
export const loginSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const profileSchema = z.object({
  name,
  company: z.string().trim().max(100),
  bio: z.string().trim().max(2000),
  country: z.string().regex(/^[A-Z]{2}$/),
  headline: z.string().trim().max(120).default(""),
  skills: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  portfolioUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(500)
        .refine((s) => s.startsWith("https://"), "Use an HTTPS portfolio URL."),
    ])
    .default(""),
  resumeUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .max(500)
        .refine((s) => s.startsWith("https://"), "Use an HTTPS resume URL."),
    ])
    .default(""),
  timezone: z
    .string()
    .max(80)
    .refine((s) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: s });
        return true;
      } catch {
        return false;
      }
    }, "Use a valid time zone.")
    .default("Asia/Kolkata"),
});
export const jobSchema = z
  .object({
    title: name,
    location: z.string().trim().min(2).max(100),
    category: z.enum(["Engineering", "Design", "Product", "Operations"]),
    description: z.string().trim().min(30).max(8000),
    salaryMin: z.number().int().min(0).max(100000000),
    salaryMax: z.number().int().min(0).max(100000000),
    stages: z.number().int().min(1).max(5),
    currency: z.enum(["USD", "INR"]).default("INR"),
  })
  .refine((d) => d.salaryMax >= d.salaryMin, {
    message: "The maximum salary must be at least the minimum salary.",
  });
export const roundSchema = z.object({
  candidateEmail: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  title: name,
  kind: z.enum(roundKinds),
  minutes: z.number().int().min(15).max(180),
  amountCents: z.number().int().min(500).max(1000000),
  scheduledAt: z.iso.datetime(),
  meetingUrl: z
    .url()
    .max(500)
    .refine((s) => s.startsWith("https://"), "Use an HTTPS meeting URL."),
  terms: z.string().trim().min(20).max(3000),
  currency: z.enum(["USD", "INR"]).default("USD"),
});
export function canTransition(status: RoundStatus, action: string, role: Role) {
  return (
    (action === "accept" && role === "candidate" && status === "offered") ||
    (action === "complete" && ["funded", "completed"].includes(status)) ||
    (action === "cancel" && ["offered", "accepted"].includes(status)) ||
    (action === "dispute" && ["funded", "completed"].includes(status))
  );
}
