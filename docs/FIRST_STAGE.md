# First-stage delivery

Version 1.2.1 contains the software scope below.
The patch requires certificate and hostname verification for production database connections.
The account pilot still needs external service activation.
A passing build does not establish a live payment service.

## Delivered scope

| Area                  | Implemented behavior                                                           | Verification                                                            |
| --------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Candidate accounts    | Google, email links, passwords, profiles, and recovery                         | Signatures, expiry, replay, ownership races, and browser flows          |
| Employer workflow     | Published roles, application search, applicant states, and paid-round offers   | Tenant checks, validation, role checks, and browser flows               |
| Candidate workflow    | Applications, withdrawal, round acceptance, private notes, and calendar files  | Ownership checks and browser flows                                      |
| Payment integration   | Razorpay, gated Stripe flow, signed events, refunds, and reversals             | Provider mocks, signatures, replay, and state checks                    |
| Complete records      | Currency totals, stable pages, CSV and account export                          | Histories above 200 records, cursors, and exports                       |
| Operator review       | Restricted queues, review notes, and audit history                             | Access denial, concurrent reviews, stale versions, and browser checks   |
| Maintenance           | Daily cleanup of expired temporary credentials and rate limits                 | Authorization, expiry, batch limits, rollback, and duplicate-run checks |
| Interview preparation | Two formats, local preparation, and optional model guidance with consent       | Input checks and browser checks                                         |
| Interface             | Visible controls, responsive layouts, keyboard focus, and clear state messages | Desktop, mobile, accessibility, and failure-state checks                |

The repository contains the migrations, tests, deployment configuration, and operator procedures.
The source has no MIT license grant.
The application has no preloaded candidate, company, payment, or interview records.

## Release acceptance

1. Run `npm run check`.
2. Apply all six migrations to an isolated PostgreSQL database.
3. Run `npm run test:e2e`.
4. Confirm CI passes on the exact pull request head.
5. Save the pre-merge base.
6. Squash-merge the verified head.
7. Confirm the Vercel source and public version.
8. Record the public health and actual service flags.

Use [the deployment record](DEPLOYMENT.md) for observed release results.
Use [the evaluation](EVALUATION.md) for test scope.

## Deferred activation

The activation items depend on external accounts, credentials, or business approval.
The code keeps the related actions unavailable until their gates pass.

| Item                  | Required action                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Managed database      | Accept the provider terms, create the durable database, configure TLS, and apply migrations                           |
| Hosting access        | The owner browser session can access the project; the MCP connector still needs team authorization                   |
| Low-friction sign-in  | Configure Google OAuth and a verified email sender; check the production callback and delivery                        |
| Operator access       | Set exact operator addresses; prove ownership through verified sign-in                                                |
| Scheduled maintenance | Configure `CRON_SECRET`; verify a successful authenticated run and its audit result                                   |
| INR payments          | Activate the merchant, approve Route and Direct Transfer, verify candidate accounts, and complete provider acceptance |
| Commercial operation  | Select suitable hosting, approve the pay contract and tax model, and confirm support and backup procedures            |

The India operator cannot use this implementation's USD separate-transfer flow.
Keep its Stripe action gate disabled.
Provider processing has a cost even when a service offers a free account.

Run the readiness report through the operator's secured environment:

```sh
node --env-file=.env.local --import tsx scripts/check-readiness.ts --database --live
```

The report omits credential values.
Exit code 1 means a required configuration or selected verification did not pass.
The report checks configuration and availability; it cannot approve a merchant or prove bank settlement.

## Later product stages

Team seats, subscriptions, tax invoices, calendar sync, and ATS integration remain later features.
Automatic dispute resolution remains outside this release.
Review closure does not release money or clear the underlying dispute.
The release has no salary deductions or repayment obligations.
Use [the roadmap](ROADMAP.md) for later-stage acceptance gates.
