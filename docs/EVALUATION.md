# Release evaluation

Evaluation date: 2 October 2026.

The release includes a working public demo and a configurable live API.
The public demo uses fictional records and cannot move money.
The live payment integration has automated tests with a mocked provider.
The owner must complete the real-service checks before a paid launch.

## Local checks

| Check | Result | Evidence and limit |
| --- | --- | --- |
| TypeScript | Passed | `npm run typecheck` |
| ESLint | Passed with two warnings | Full-page account redirects reset client state. The warnings concern Next.js navigation. |
| Production build | Passed | Next.js 16.3.8 built all public and workspace routes. |
| Unit and API tests | 34 passed | Vitest, PGlite, and a mocked Stripe client |
| Browser tests | 8 passed | Chromium through Playwright |
| Accessibility | Passed | No serious or critical Axe findings on 15 routes |
| Responsive layout | Passed | No horizontal overflow at 1440px and 390px on home and workspace |
| Dependency audit | Passed | `npm audit` reported zero known vulnerabilities at evaluation time. |
| Prose checks | Passed with advisory warnings | The STE linter found no errors. The approved dictionary is not part of the skill. |

The screenshot files in `docs/screenshots` show the evaluated layouts.
The accessibility result covers automated checks.
A full review with assistive technology remains part of launch acceptance.

## Design review

The final finish-review disposition is **ship**.
The bounded review found four material issues and verified their repair in new screenshots.

| Finding | Final result |
| --- | --- |
| Connected round path and icon fields | Restored and verified |
| Headline scale, white type, and main action | Restored and verified |
| White outcome and navy/outlined role actions | Restored and verified |
| Extra labels above process headings | Removed and verified |

## Payment and account evidence

API tests apply the schema to an actual PostgreSQL engine through PGlite.
The tests check account ownership and reject actions from another account.
The tests check exact-origin validation and unauthenticated access.

Money tests check both completion confirmations before release.
The tests also check repeated release calls, provider failure rollback, and webhook replay.
Refund tests check cumulative amounts and transfer reversal totals.
No test moves real money.

Browser tests check job creation, candidate applications, acceptance, funding, completion, release, and disputes in the demo.
The tests also check CSV export, browser persistence, local preparation, and the bonus calculator.
The demo API refuses account registration and Stripe events.

## GitHub hygiene

The supplied hygiene skill contains no audit or Mermaid helper scripts.
Equivalent checks use the repository's actual files and Git state.
The direct checks cover YAML, license, citation, closed fences, Mermaid text, author identity, and commit messages.
No helper-script success is claimed.

The repository includes CI, contribution instructions, a security policy, and an MIT license.
CI runs tests, builds the app, and applies the migration to PostgreSQL 17.
Publishing requires a successful CI run before the squash merge.
The pre-merge base has a backup branch.

## Launch limits

- No commercial Stripe account or live transaction has passed acceptance checks.
- No hosted database or email account is configured for the public demo.
- Country support and employment terms need the owner's local review.
- Salary deductions and repayment debts have no implementation.
- The bonus credit is a calculator proposal, with no payroll instructions.
- Team and Scale prices are proposals, with no subscription billing.
- Dispute decisions need an operator. The release has no operator console.
- Tax collection, team membership, SSO, ATS sync, and calendar sync remain on the roadmap.
- Workspace queries return bounded results without pagination.
- Optional model behavior needs separate tests against the selected endpoint and weights.

Use [the launch guide](LAUNCH.md) for the required service checks.
Use [the operator guide](OPERATIONS.md) for reconciliation and incident procedures.
