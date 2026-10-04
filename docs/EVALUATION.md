# Release evaluation

Evaluation record date: 4 October 2026.

Accounts and workspace records use PostgreSQL.
The release adds authentication, information features, and provider integrations.
Full release results must show the exact source commit.

## Evidence recorded so far

| Check | Recorded result | Scope |
| --- | --- | --- |
| Full source lint | Passed | ESLint across the repository |
| Type check | Passed | TypeScript with no emitted files |
| Unit and API tests | 177 passed, 3 skipped locally | Five files; PGlite, test RSA keys, and mocked provider requests |
| PostgreSQL concurrency tests | Await CI | Three cross-connection ownership races need the CI database |
| Production build | Passed | Next.js 16.3.8, version 1.1.0 |
| Production dependency audit | 0 vulnerabilities | 35 production dependencies through npm audit |
| Browser checks | 8 passed, 5 skipped locally | Public controls and accessibility; authenticated workflows need CI PostgreSQL |
| Final visual confirmation | 3 targeted tests passed | Desktop and mobile controls, Google icon, navigation, and fresh-password fields |
| Documentation linter | 0 errors | STE mechanical checks; technical and parser advisories reviewed |
| Direct repository audit | Passed | YAML, fences, Mermaid syntax patterns, license removal, credential patterns, and Git identity |
| Public deployment | Not yet recorded for this release | Add the final source commit and public-domain results |

Local skips do not establish the result of the PostgreSQL checks.
Earlier screenshots and test reports cannot establish the state of changed code.
Update [the deployment record](DEPLOYMENT.md) after the current source reaches Ready.

Four current screenshots cover the home and account pages at desktop and mobile widths.
The release removes older screenshots whose content no longer matches the app.
The design detector ran once and returned advisory findings only.
The final confirmation found no new material visual defect.

## Authentication coverage

The tests check browser-bound Google state and PKCE.
The tests check RSA signatures, audience, issuer, expiry, email verification, and nonce.
The tests reject callback replay and token exchange failure.
The permanent Google subject remains stable after an email change.

Email link tests check expiry, hashed secrets, browser binding, and one-time consumption.
The tests preserve verified account roles.
The tests revoke an unverified registrant's credentials, sessions, and tokens at the first verified claim.
The tests preserve financial mappings during that claim.
The tests check generic responses, cross-origin rejection, delivery failure, and rate limits.
Google and Resend calls use mocks in these tests.

## Backend release checks

Record the final results for each check:

- Tenant isolation for profiles, jobs, applicants, rounds, and exports.
- Input validation for currencies, profile URLs, skills, and time zones.
- Candidate withdrawal and employer application updates.
- Private note ownership.
- Calendar access and text escaping.
- Full CSV export beyond the 200-row workspace limit.
- Payment amount, currency, order, and recipient validation.
- Completion from both participants before release.
- Provider request retries and event replay.
- Refund, reversal, dispute, and uncertain request recovery.
- JSON body and origin validation.

## Browser and visual checks

The release needs checks at desktop and mobile widths.
Check the visible text and buttons in every state.
Check the focus, disabled controls, progress states, and error messages.
Check the account sign-in and sign-out.
Check profiles, roles, applications, acceptance, notes, calendars, and exports.
Check the preparation feature with the local guide.

Provider-hosted checkout needs separate acceptance with the selected merchant account.
Do not infer payment approval from a screenshot or a mocked response.
Do not label an illustrative template as a completed interview record.

## GitHub and deployment checks

Check the owner identity and concise Conventional Commit message.
Check the exact pull request head through CI.
Save the pre-merge base.
Read back the squash merge and connected Vercel source.

The supplied GitHub hygiene skill contains no helper scripts.
Use direct checks for source, YAML, fences, Mermaid, links, and Git identity.
Do not claim a helper ran when the helper file does not exist.

Check the public health response and service availability.
Record public-domain evidence without account secrets or personal data.
The production result must state which services remain unavailable.

## Commercial limits

Google and email sign-in need approved credentials.
Payment providers need merchant activation and the interview funds-flow review.
Razorpay Route needs approved linked accounts and operator-controlled mappings.
Stripe needs platform and country approval.
Provider sandbox and commercial transaction checks remain separate from automated tests.

Country policy, contracts, taxes, and support procedures need owner approval.
The release has no salary deductions or repayment debt.
Team and Scale prices remain proposals without subscriptions.
The release has no automatic dispute decisions or operator console.
Large deployments need pagination and export load checks.
The optional model needs separate acceptance against its configured endpoint.

See [the launch guide](LAUNCH.md) and [the operator guide](OPERATIONS.md).
