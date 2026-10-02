import {
  canTransition,
  jobSchema,
  profileSchema,
  quote,
  roundSchema,
  type Application,
  type Dispute,
  type Job,
  type LedgerEntry,
  type Role,
  type Round,
  type User,
  type Workspace,
} from "./domain";

const employerId = "00000000-0000-4000-8000-000000000001";
const candidateId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";
const day = 86400000;
export const demoJobs: Job[] = [
  {
    id: jobId,
    employerId,
    company: "Northstar Studio",
    title: "Product designer",
    location: "Remote · Americas",
    category: "Design",
    description:
      "Help a small product team turn complex workflows into clear interfaces. Share one project that explains your choices. The paid interview process includes an introduction, a skills discussion, and a scoped work sample.",
    salaryMin: 85000,
    salaryMax: 120000,
    stages: 3,
    status: "open",
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    employerId,
    company: "Common Ground",
    title: "Frontend engineer",
    location: "Remote · Europe",
    category: "Engineering",
    description:
      "Build accessible web interfaces with TypeScript and React. The team cares about maintainable code and clear communication. Both interview rounds have a stated amount and duration before you accept.",
    salaryMin: 90000,
    salaryMax: 140000,
    stages: 2,
    status: "open",
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    employerId,
    company: "Fieldwork",
    title: "Product operations lead",
    location: "Remote · Global",
    category: "Operations",
    description:
      "Help a distributed team improve its product processes. Bring an example of a process you changed and explain the result. The work sample uses fictional data and remains within the stated time.",
    salaryMin: 70000,
    salaryMax: 105000,
    stages: 3,
    status: "open",
    createdAt: "2026-10-01T10:00:00Z",
  },
];
export interface DemoData {
  users: Record<Role, User>;
  rounds: Round[];
  jobs: Job[];
  applications: Application[];
  ledger: LedgerEntry[];
  disputes: Dispute[];
}
export function seedDemo(): DemoData {
  const now = Date.now();
  const base = {
    employerId,
    candidateId,
    candidateName: "Alex Morgan",
    candidateEmail: "alex@example.test",
    company: "Northstar Studio",
    title: "Product designer",
    meetingUrl: "https://meet.example.test/demo",
    terms:
      "A paid interview with fictional work only. You keep the round pay regardless of the hire decision. No salary deduction applies.",
    employerConfirmed: false,
    candidateConfirmed: false,
    createdAt: new Date(now - day * 2).toISOString(),
  };
  const rounds: Round[] = [
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000011",
      kind: "Skills interview",
      minutes: 60,
      amountCents: 4500,
      feeCents: 360,
      status: "funded",
      scheduledAt: new Date(now - day).toISOString(),
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000012",
      kind: "Work sample",
      minutes: 90,
      amountCents: 9000,
      feeCents: 720,
      status: "offered",
      scheduledAt: new Date(now + day * 3).toISOString(),
    },
    {
      ...base,
      id: "00000000-0000-4000-8000-000000000013",
      kind: "Introduction",
      minutes: 30,
      amountCents: 1500,
      feeCents: 120,
      status: "paid",
      employerConfirmed: true,
      candidateConfirmed: true,
      scheduledAt: new Date(now - day * 3).toISOString(),
    },
  ];
  return {
    users: {
      employer: {
        id: employerId,
        name: "Jamie Chen",
        email: "jamie@example.test",
        role: "employer",
        company: "Northstar Studio",
        bio: "A small team with a clear interview process.",
        country: "US",
        verified: true,
      },
      candidate: {
        id: candidateId,
        name: "Alex Morgan",
        email: "alex@example.test",
        role: "candidate",
        company: "",
        bio: "Product designer with a focus on accessible interfaces.",
        country: "US",
        verified: true,
      },
    },
    rounds,
    jobs: structuredClone(demoJobs),
    applications: [
      {
        id: "demo-application",
        jobId,
        candidateId,
        candidateName: "Alex Morgan",
        email: "alex@example.test",
        note: "I would like to share my approach to accessible product design.",
        status: "applied",
        createdAt: new Date(now - day * 2).toISOString(),
      },
    ],
    ledger: [
      {
        id: "demo-paid",
        roundId: rounds[2].id,
        type: "paid",
        amountCents: 1500,
        createdAt: new Date(now - day * 2).toISOString(),
      },
      {
        id: "demo-funded",
        roundId: rounds[0].id,
        type: "funded",
        amountCents: 4860,
        createdAt: new Date(now - day * 2).toISOString(),
      },
    ],
    disputes: [],
  };
}
export function demoWorkspace(data: DemoData, role: Role): Workspace {
  return {
    user: data.users[role],
    rounds: data.rounds,
    jobs: role === "employer" ? data.jobs : [],
    applications: data.applications,
    ledger: data.ledger,
    disputes: data.disputes,
  };
}
export function mutateDemo(
  data: DemoData,
  role: Role,
  route: string,
  input: Record<string, unknown> = {},
) {
  const next = structuredClone(data);
  const user = next.users[role];
  const parts = route.split("/");
  const stamp = new Date().toISOString();
  if (route === "profile") {
    Object.assign(user, profileSchema.parse(input));
    return next;
  }
  if (route === "jobs") {
    if (role !== "employer") throw new Error("Only employers can post jobs.");
    const job = jobSchema.parse(input);
    next.jobs.unshift({
      ...job,
      id: crypto.randomUUID(),
      employerId: user.id,
      company: user.company || "Your team",
      status: "open",
      createdAt: stamp,
    });
    return next;
  }
  if (parts[0] === "jobs" && parts[2] === "close") {
    if (role !== "employer") throw new Error("Only employers can close jobs.");
    const job = next.jobs.find((j) => j.id === parts[1]);
    if (!job) throw new Error("The job does not exist.");
    job.status = "closed";
    return next;
  }
  if (parts[0] === "jobs" && parts[2] === "apply") {
    if (role !== "candidate")
      throw new Error("Switch to the candidate workspace to apply.");
    if (!next.jobs.some((j) => j.id === parts[1] && j.status === "open"))
      throw new Error("The job is no longer open.");
    if (next.applications.some((a) => a.jobId === parts[1]))
      throw new Error("You already applied for this job.");
    if (typeof input.note !== "string" || input.note.trim().length < 20)
      throw new Error("Write at least 20 characters about your interest.");
    next.applications.unshift({
      id: crypto.randomUUID(),
      jobId: parts[1],
      candidateId: user.id,
      candidateName: user.name,
      email: user.email,
      note: input.note.trim().slice(0, 3000),
      status: "applied",
      createdAt: stamp,
    });
    return next;
  }
  if (route === "rounds") {
    if (role !== "employer")
      throw new Error("Only employers can offer a round.");
    const round = roundSchema.parse(input);
    const price = quote(round.amountCents);
    if (Date.parse(round.scheduledAt) <= Date.now())
      throw new Error("Choose a future time for the round.");
    next.rounds.unshift({
      ...round,
      ...price,
      id: crypto.randomUUID(),
      employerId: user.id,
      candidateId: next.users.candidate.id,
      candidateName: next.users.candidate.name,
      company: user.company,
      title: round.title,
      status: "offered",
      employerConfirmed: false,
      candidateConfirmed: false,
      createdAt: stamp,
    });
    return next;
  }
  if (parts[0] === "rounds" && parts.length === 3) {
    const round = next.rounds.find((r) => r.id === parts[1]);
    const action = parts[2];
    if (!round) throw new Error("The round does not exist.");
    if (action === "fund") {
      if (role !== "employer" || round.status !== "accepted")
        throw new Error(
          "The candidate must accept this round before you fund it.",
        );
      round.status = "funded";
      next.ledger.unshift({
        id: crypto.randomUUID(),
        roundId: round.id,
        type: "funded",
        amountCents: round.amountCents + round.feeCents,
        createdAt: stamp,
      });
      return next;
    }
    if (action === "release") {
      if (
        round.status !== "completed" ||
        !round.candidateConfirmed ||
        !round.employerConfirmed
      )
        throw new Error(
          "Both people must confirm completion before payment release.",
        );
      round.status = "paid";
      next.ledger.unshift({
        id: crypto.randomUUID(),
        roundId: round.id,
        type: "paid",
        amountCents: round.amountCents,
        createdAt: stamp,
      });
      return next;
    }
    if (!canTransition(round.status, action, role))
      throw new Error("This action is not available for this round.");
    if (action === "accept") round.status = "accepted";
    if (action === "cancel") round.status = "cancelled";
    if (action === "complete") {
      if (Date.parse(round.scheduledAt) + round.minutes * 60000 > Date.now())
        throw new Error("Confirm completion after the scheduled round ends.");
      if (role === "employer") round.employerConfirmed = true;
      else round.candidateConfirmed = true;
      if (round.employerConfirmed && round.candidateConfirmed)
        round.status = "completed";
    }
    if (action === "dispute") {
      if (typeof input.reason !== "string" || input.reason.trim().length < 20)
        throw new Error("Explain the dispute in at least 20 characters.");
      round.status = "disputed";
      next.disputes.unshift({
        id: crypto.randomUUID(),
        roundId: round.id,
        reason: input.reason.trim(),
        status: "open",
        createdAt: stamp,
      });
    }
    return next;
  }
  throw new Error("This demo action is not available.");
}
