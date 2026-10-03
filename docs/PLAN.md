# Product and delivery plan

## The offer

Fairstage helps employers pay people for interview time.
Each round has a fixed amount, duration, and scope.
Candidates accept the terms before the employer funds the round.
Candidates keep pay after a completed round regardless of the hire decision.

The product serves candidates and employers through separate accounts.
Real records use PostgreSQL and server sessions.
Google sign-in and email links reduce the need for passwords.
A password account remains available as an alternative.

## Proposed prices

The global product plan proposes USD prices.
The operator must approve commercial terms before a paid launch.

| Round | Duration | Proposed candidate pay |
| --- | --- | --- |
| Introduction | 30 minutes | $15 |
| Skills interview | 60 minutes | $45 |
| Work sample | 90 minutes | $90 |

Employers can choose a higher amount.
The round terms define the work sample scope.
The product policy excludes unpaid client work.

| Plan | Monthly fee | Platform fee |
| --- | --- | --- |
| Launch | $0 | 8% of candidate pay |
| Team | $79 proposal | 5% proposal |
| Scale | $249 proposal | 3% proposal |

The release applies the Launch fee only.
Candidates pay no platform fee.
Payment providers charge processing fees independently of account fees.
Team and Scale need a separate subscription release.

The app supports INR amounts for an approved Razorpay Route workflow.
Employers choose INR amounts directly; the app does not apply exchange rates.
USD rounds use an approved Stripe platform.
The operator must check provider eligibility and candidate country support.

## Interview formats

The examples page contains two reusable formats.
An introduction covers experience, the role, and candidate questions in 30 minutes.
A skills interview covers one permitted project and a role-specific scenario in 60 minutes.
Employers set the amount and schedule before the candidate accepts either format.

## Account and information features

Profiles include a headline, skills, work links, and a time zone.
Employer workspaces expose applicant information for their own jobs.
Candidates can track or withdraw their own applications.
Employers can set review, interview, offer, hire, and rejection states.
No model score selects an applicant.

Interview participants can download calendar files and save private notes.
Payment CSV files include the currency of each event.
Account exports include authorized account and interview records.
The local preparation guide works without an external model.

## Salary recovery

The original idea treats interview pay as an advance against the first salary.
The release excludes salary deductions and repayment debt.
Local legal review must precede any change to that rule.
Consent alone does not establish a lawful wage deduction.

The calculator shows a possible credit against a separate signing bonus.
The credit cannot exceed interview pay or the separate bonus.
The calculator does not reduce base salary or issue payroll instructions.

## Release steps

1. Define the pay policy and provider funds flow.
2. Repair visual controls and access states.
3. Add real accounts and ownership checks.
4. Add richer profiles and application controls.
5. Add provider integrations and failure recovery.
6. Test accounts, records, exports, and payment transitions.
7. Check the exact source commit through CI.
8. Deploy the verified source to Vercel.
9. Check the public domain and service readiness.
10. Record results in the evaluation and deployment guides.

## Commercial acceptance

Merchant activation and provider approval remain separate from code delivery.
Google and email methods need owner credentials.
Candidate payment accounts need provider approval.
The owner must approve countries, contracts, taxes, and support procedures.
Use [the launch guide](LAUNCH.md) to record those checks.

## Success measures

Measure candidate acceptance, completed rounds, time to transfer, and disputes.
Compare employer cost with completion and candidate feedback.
Do not claim a result before the pilot produces data.
