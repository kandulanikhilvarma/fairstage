# Release evaluation

Evaluation record date: 5 October 2026.

## Version 1.2.0 local checks

The release adds restricted case review, complete-history totals, stable pagination, and authenticated maintenance.
The local source lint, TypeScript check, and production build passed.
Unit and API checks passed 272 tests across nine files.
Four PostgreSQL concurrency cases need the CI database and skipped locally.
All six migrations passed through the PGlite fixtures.
The CI database must also apply the migrations before release.
Eight public browser checks passed locally.
Eight operator checks passed with restricted-access responses and isolated route fixtures.
The fixtures cover mobile targets, accessibility, stale edits, pagination, and recovery.
Five account workflow checks need the CI database and skipped locally.

The readiness report exposes configuration status without credential values.
The report does not establish provider approval.
Use [the first-stage delivery](FIRST_STAGE.md) for scope and deferred activation.

The production dependency audit reported zero vulnerabilities.
The full audit reported five related development findings from one unpatched `braces` dependency.
That dependency belongs to the Next.js ESLint tooling.
The advisory reports no patched version. [Upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
The app does not accept public glob patterns through this development tool.
Keep the development environment restricted to trusted source.

## Previous application release: 1.1.0

Accounts and workspace records use PostgreSQL.
The release adds authentication, information features, and provider integrations.
The application release commit is `d9f477ee13b80a0ad57ccc29246a847f7cc9af0a`.
Its verified pull request head is `15b2ccfb31999d726fd21044939cfe07c8317da1`.

### Previous release evidence

| Check                        | Recorded result                   | Scope                                                                                         |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Full source lint             | Passed                            | ESLint across the repository                                                                  |
| Type check                   | Passed                            | TypeScript with no emitted files                                                              |
| Unit and API tests           | 180 passed in CI; 177 locally     | Five files; database, authentication, and payment checks                                      |
| PostgreSQL concurrency tests | 3 passed in CI                    | Cross-connection ownership races; these three cases skipped locally                           |
| SQL migrations               | 4 applied in CI                   | Initial, authentication, workspace, and Razorpay migrations                                   |
| Production build             | Passed                            | Next.js 16.3.8, version 1.1.0                                                                 |
| Production dependency audit  | 0 vulnerabilities                 | 35 production dependencies through npm audit                                                  |
| Browser checks               | 13 passed in CI; 8 passed locally | Five authenticated workflows used CI PostgreSQL and skipped locally                           |
| Populated wallet checks      | 4 passed locally                  | Both roles downloaded 221 CSV rows and showed 503 errors; route mocks only                    |
| Final visual confirmation    | 3 targeted tests passed           | Desktop and mobile controls, Google icon, navigation, and fresh-password fields               |
| Documentation linter         | 0 errors                          | STE mechanical checks; technical and parser advisories reviewed                               |
| Direct repository audit      | Passed                            | YAML, fences, Mermaid syntax patterns, license removal, credential patterns, and Git identity |
| Public deployment            | Verified on 4 October 2026        | 16 pages returned 200; version 1.1.0; account and payment services unavailable                |

The [release CI run](https://github.com/kandulanikhilvarma/fairstage/actions/runs/37194633779) passed on the exact pull request head.
The run applied all four migrations and passed all 180 unit tests and 13 browser tests.
CI used an isolated PostgreSQL 17 service.
The [main-branch CI run](https://github.com/kandulanikhilvarma/fairstage/actions/runs/37194805287) also passed on the merged application source.

Local skips do not establish the result of the PostgreSQL checks.
The public health response was 503 because the account database was unavailable.
All public service flags were false, and the default currency was INR.
See [the deployment record](DEPLOYMENT.md) for the source and service results.

Four current screenshots cover the home and account pages at desktop and mobile widths.
The release removes older screenshots whose content no longer matches the app.
The design detector ran once and returned advisory findings only.
The final confirmation found no new material visual defect.
The published workspace and account page showed clear controls and service-unavailable messages.

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

Automated coverage includes these checks:

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
The release has no automatic dispute decisions.
Operator review needs a verified account on the server allowlist.
Stable pagination and complete totals have dedicated tests above 200 records.
High-volume deployments still need resource and export load checks.
The optional model needs separate acceptance against its configured endpoint.

See [the launch guide](LAUNCH.md) and [the operator guide](OPERATIONS.md).
