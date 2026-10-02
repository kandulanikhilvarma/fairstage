# Product and delivery plan

## The offer

Fairstage helps employers pay people for interview time.
Each round has a fixed amount, a duration, and clear terms.
Candidates keep the amount after a completed round, even if the employer rejects them.

## Pilot prices

The plan proposes these prices. The prices are not commercial terms.

| Round | Time | Candidate pay |
| --- | --- | --- |
| Introduction | 30 minutes | $15 |
| Skills interview | 60 minutes | $45 |
| Work sample | 90 minutes | $90 |

The employer can choose a higher amount.
The product limits a work sample to the agreed scope.
An employer cannot use a candidate work sample as unpaid client work.

| Plan | Monthly fee | Platform fee |
| --- | --- | --- |
| Launch | $0 | 8% of candidate pay |
| Team | $79 | 5% of candidate pay |
| Scale | $249 | 3% of candidate pay |

The platform absorbs payment processing costs in this release. Applicable taxes need a separate launch review.
Candidates pay no platform fee.
The first release applies the Launch fee only. Paid subscriptions need a later billing release.

## Salary recovery

The original proposal treats interview pay as an advance against the first salary.
Salary recovery needs local legal review. Consent alone does not establish a lawful deduction.
The app does not deduct wages, request repayments, or export payroll deductions.
The default is unconditional interview pay.

The calculator can show a proposed credit against a separate signing bonus.
The bonus proposal does not reduce the base salary.

## Delivery steps

1. Record the product rules. Check the price formulas and policy boundaries.
2. Choose the brand and page structure. Check the candidate and employer paths.
3. Build the public site and demo workspace. Check all visible actions.
4. Build the live API and database schema. Test roles, ownership, and money states.
5. Add Stripe interfaces and the AI assistant. Test failure states and webhook replay.
6. Add setup guides and CI. Run type checks, tests, lint, and the production build.
7. Publish the public repository. Read back its state and CI results.
8. Deploy to Vercel. Test the public URL and document launch limits.

## Release boundaries

The first release includes jobs, applications, rounds, payment records, disputes, and preparation tools.
Calendar sync, ATS sync, SSO, and paid subscription billing are later releases.

The public demo uses browser storage. The demo cannot move money or send messages.
The live service uses PostgreSQL and server sessions.
Stripe credentials enable checkout and Connect account setup.
Transfers need both a completed round and a verified candidate account.

## Success measures

Measure candidate acceptance, completed rounds, time to payment, and disputes.
Compare employer costs with interview completion and candidate feedback.
Do not claim a result before the pilot produces data.
