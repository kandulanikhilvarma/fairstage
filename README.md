# Fairstage

**Good interviews. Fair pay.**

Employers pay candidates for interview time. Each round starts with an agreed amount, duration, and scope.
Candidates keep earned interview pay regardless of the hire decision.

[![CI](https://github.com/kandulanikhilvarma/fairstage/actions/workflows/ci.yml/badge.svg)](https://github.com/kandulanikhilvarma/fairstage/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.3.8-141b33.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](tsconfig.json)

[Open Fairstage](https://fairstage.vercel.app) · [Contributing](CONTRIBUTING.md) · [Apache-2.0 license](LICENSE) · [Security](SECURITY.md)

![Fairstage home page: a blue hero, lime action, and three interview rounds with visible pay](docs/images/fairstage-home.png)

The supplied product visual shows illustrative USD pilot prices. It does not show completed transactions or current payment availability.

> **Release status:** The published application is version 1.2.1.
> On 9 October 2026, its health endpoint returned HTTP 503 and all service flags were false.
> Account workflows need the production database. Google, email, and payment methods need separate service activation.
> See the [deployment record](docs/DEPLOYMENT.md) and [launch guide](docs/LAUNCH.md) before a commercial pilot.

## Contents

- [Product model](#product-model)
- [Features](#features)
- [Screens](#screens)
- [Architecture](#architecture)
- [Interview and payment flow](#interview-and-payment-flow)
- [Data model](#data-model)
- [Local setup](#local-setup)
- [Configuration](#configuration)
- [API map](#api-map)
- [Verification](#verification)
- [Deploy and operate](#deploy-and-operate)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Product model

An employer offers a paid round. The candidate reviews its terms before acceptance.
The employer funds the agreed amount through an approved provider.
Both participants confirm completion after the scheduled end.
A participant then requests release; the server checks the round and provider records before transfer.

Candidates pay no platform fee. The employer pays the Launch fee at 8% of candidate pay.
The Launch plan has no monthly subscription charge.
Provider fees still apply. The app does not calculate service tax at checkout.
Commercial prices and tax treatment need operator approval before launch.

| Illustrative USD round | Duration   | Candidate pay | Launch fee | Employer total before tax |
| ---------------------- | ---------- | ------------- | ---------- | ------------------------- |
| Introduction           | 30 minutes | $15.00        | $1.20      | $16.20                    |
| Skills interview       | 60 minutes | $45.00        | $3.60      | $48.60                    |
| Work sample            | 90 minutes | $90.00        | $7.20      | $97.20                    |

Employers choose amounts in USD or INR. Each round has one currency; the app does not apply exchange rates.
The server stores integer minor units and calculates the fee.
Round records store candidate pay and the platform fee separately.
Funded ledger entries record the employer total; paid entries record the candidate transfer.
Provider costs reduce platform margin rather than the offered candidate amount.

The product excludes salary deductions and repayment debt.
The bonus calculator compares earned interview pay with a separate proposed bonus.
It creates no contract or payroll instruction.
See [the money rules](docs/MONEY.md) for fees, balances, refunds, disputes, and settlement limits.

### Payment coverage

| Currency | Implemented integration                     | Activation boundary                                                                               |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| INR      | Razorpay Checkout and Route Direct Transfer | Approved merchant, Route access, Direct Transfer access, and activated candidate linked accounts  |
| USD      | Stripe Checkout and Connect                 | Approved platform jurisdiction, funds flow, candidate countries, and connected account capability |

The operating company is in India.
Keep this implementation's USD action gate disabled for the India operator.
Stripe India does not support its separate charges and transfers model. [Stripe marketplace limits](https://support.stripe.com/questions/stripe-india-support-for-marketplaces).
Razorpay eligibility also needs provider review. [Razorpay Route](https://razorpay.com/docs/payments/route/).
Global product scope does not establish global payment coverage.

## Features

The table describes software in published `main`. Service credentials and merchant approval remain separate requirements.

| Area                | Implemented behavior                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Public discovery    | Prices, pay policy, role search, and two reusable interview formats                                                |
| Accounts            | Candidate and employer roles; Google, email-link, and password sign-in; verification and password reset            |
| Profiles            | Headline, skills, biography, portfolio and resume links, country, and time zone                                    |
| Employer workspace  | Role publication and closure, applicant search, manual application states, and paid-round offers                   |
| Candidate workspace | Applications, withdrawal, round acceptance, and payment records                                                    |
| Interviews          | Agreed terms, scheduled times, participant-only calendar downloads, and private notes                              |
| Payments            | Provider checkout, capture checks, controlled release, signed events, replay protection, and refund reconciliation |
| Complete records    | Stable cursor pages, full-history totals per currency, complete payment CSV, and account JSON export               |
| Disputes            | Participant reports that block release; provider dispute and reversal records                                      |
| Operator review     | Verified allowlist access, review queues, append-only notes, and stale-edit protection                             |
| Maintenance         | Authenticated daily cleanup, bounded batches, run records, and a readiness report without credential values        |
| Preparation         | Local guidance and an optional OpenAI-compatible model endpoint with explicit consent                              |
| Interface           | Responsive layouts, visible controls, keyboard focus, minimum touch targets, and reduced-motion support            |

Operator review records decisions and notes. It does not adjudicate disputes or release money.
The model assistant cannot rank candidates, change application states, or approve payment.
The app has no preloaded people, companies, interviews, or payments.

### Two interview formats

| Format           | Suggested scope                                                          | Where to start                                           |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Introduction     | Experience, role expectations, and candidate questions within 30 minutes | [Public examples](https://fairstage.vercel.app/examples) |
| Skills interview | One permitted project and a role-specific scenario within 60 minutes     | [Public examples](https://fairstage.vercel.app/examples) |

Employers specify pay and schedule before the candidate accepts.
These formats create no account records. See [`lib/templates.ts`](lib/templates.ts) for their source.

## Screens

The hero above uses the supplied image unchanged.
The repository also records desktop and mobile layouts from earlier verification.

<details>
<summary>Mobile home page</summary>

![Fairstage mobile home page with the round path and visible actions](docs/screenshots/production-home-mobile.png)

</details>

<details>
<summary>Operator review on desktop and mobile</summary>

![Desktop operator case review with notes and status controls](docs/screenshots/operator-desktop.png)

![Mobile operator case review with visible controls](docs/screenshots/operator-mobile.png)

These operator images use isolated test fixtures. They do not establish live account or payment activation.

</details>

The [design system](DESIGN.md) defines the blue and lime palette, type, spacing, controls, and responsive rules.

## Architecture

Next.js serves the public site, workspaces, and server API on Vercel.
PostgreSQL owns account and financial records.
Protected queries check the actor and resource owner.
The browser receives service flags and authorized records; it receives no server credentials.

```mermaid
flowchart LR
    Browser["Browser<br/>Public site and workspaces"] -->|HTTPS| Pages["Next.js App Router<br/>Pages and API routes"]
    subgraph Server["Vercel - Node.js runtime"]
        Pages --> Auth["Authentication<br/>Roles, sessions, origin checks"]
        Auth --> Business["Business modules<br/>Rounds, queries, operator review"]
        Hooks["Webhook routes<br/>Raw-body signature checks"] --> Business
        Cron["Authorized maintenance route"] --> Business
    end
    Business --> DB[("PostgreSQL<br/>Accounts, rounds, ledger, audit")]
    Browser --> Google["Google OAuth"]
    Google --> Auth
    Business --> Email["Resend<br/>Sign-in and recovery email"]
    Business --> Razorpay["Razorpay<br/>INR checkout and Route"]
    Business --> Stripe["Stripe<br/>Gated USD checkout and Connect"]
    Razorpay --> Hooks
    Stripe --> Hooks
    Business -->|"Explicit consent"| Model["Optional model endpoint<br/>General preparation only"]
```

### Source map

| Path                                                                             | Responsibility                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`app/`](app)                                                                    | Public pages, workspace routes, and API entry points               |
| [`components/`](components)                                                      | Account, workspace, operator, and public controls                  |
| [`lib/domain.ts`](lib/domain.ts)                                                 | Types, input validation, currencies, prices, and round states      |
| [`lib/security.ts`](lib/security.ts)                                             | Passwords, hashed sessions, origin checks, and durable rate limits |
| [`lib/auth.ts`](lib/auth.ts), [`lib/google-auth.ts`](lib/google-auth.ts)         | Email ownership and Google identity checks                         |
| [`lib/queries.ts`](lib/queries.ts)                                               | Owner-scoped cursor pages and complete-history summaries           |
| [`lib/payments.ts`](lib/payments.ts), [`lib/razorpay.ts`](lib/razorpay.ts)       | Provider actions, signed events, and reconciliation                |
| [`lib/operator.ts`](lib/operator.ts), [`lib/maintenance.ts`](lib/maintenance.ts) | Restricted review and scheduled cleanup                            |
| [`lib/database-config.ts`](lib/database-config.ts), [`lib/db.ts`](lib/db.ts)     | Connection validation, PostgreSQL pool, and transactions           |
| [`db/`](db)                                                                      | Six ordered SQL migrations in version 1.2.1                        |
| [`scripts/`](scripts)                                                            | Migration, readiness, and commit checks                            |
| [`tests/`](tests), [`e2e/`](e2e)                                                 | Unit, API, concurrency, and browser checks                         |

See [the architecture guide](docs/ARCHITECTURE.md) for authentication boundaries and failure recovery.

## Interview and payment flow

The diagram shows a successful round with an enabled provider and a ready recipient account.
The server rejects release if a dispute or unresolved provider record blocks it.

```mermaid
sequenceDiagram
    actor Employer
    actor Candidate
    participant API as Fairstage API
    participant DB as PostgreSQL
    participant Provider as Approved provider
    Employer->>API: Offer pay, scope, duration, and schedule
    API->>DB: Save offered round
    Candidate->>API: Accept agreed terms
    API->>DB: Save accepted state
    Employer->>API: Request funding
    API->>Provider: Create order or hosted checkout
    Employer->>Provider: Pay through provider checkout
    Provider->>API: Signed capture event
    API->>Provider: Verify provider payment records
    API->>DB: Lock round and record funded state
    Note over Employer,Candidate: Hold the interview<br/>and reach its scheduled end
    Employer->>API: Confirm completion
    Candidate->>API: Confirm completion
    API->>DB: Record both confirmations and completed state
    Candidate->>API: Request release
    Note over Candidate,API: Either participant<br/>can request release
    API->>DB: Lock round and check release conditions
    API->>Provider: Transfer candidate amount with stable request key
    Provider-->>API: Confirmed transfer or pending result
    API->>DB: Record paid only after transfer confirmation
    Note over DB,Provider: Provider account transfer<br/>is separate from<br/>bank settlement
```

### Round states

```mermaid
stateDiagram-v2
    [*] --> offered
    offered --> accepted: Candidate accepts
    offered --> cancelled: Either participant cancels
    accepted --> funded: Provider confirms capture
    accepted --> cancelled: No unresolved provider order
    funded --> completed: Both confirm after scheduled end
    funded --> disputed: Participant reports a problem
    completed --> disputed: Participant reports a problem
    completed --> paid: Provider confirms transfer
    paid --> disputed: Provider dispute or reversal
    funded --> cancelled: Provider confirms full refund
    completed --> cancelled: Provider confirms full refund
    paid --> cancelled: Provider confirms full refund
```

This diagram shows the main paths. Partial refunds and failed or uncertain transfers need reconciliation.
`paid` confirms a transfer to the provider account; it does not prove receipt in a bank account.
Unique event references prevent duplicate ledger records.
An operator must check provider records before a replacement transfer.

## Data model

The diagram shows the core foreign keys. It omits credentials, provider fields, and supporting audit tables for readability.
Rounds link directly to participants. They have no database foreign key to a job or application.

```mermaid
erDiagram
    users ||--o{ jobs : owns
    users ||--o{ applications : submits
    jobs ||--o{ applications : receives
    users ||--o{ rounds : employer
    users ||--o{ rounds : candidate
    rounds ||--o{ ledger : records
    rounds ||--o| disputes : has
    users {
        uuid id PK
        text role
        boolean email_verified
    }
    jobs {
        uuid id PK
        uuid employer_id FK
        text status
        text currency
    }
    applications {
        uuid id PK
        uuid job_id FK
        uuid candidate_id FK
        text status
    }
    rounds {
        uuid id PK
        uuid employer_id FK
        uuid candidate_id FK
        integer amount_cents
        integer fee_cents
        text currency
        text status
    }
    ledger {
        uuid id PK
        uuid round_id FK
        text provider_ref UK
        integer amount_cents
    }
    disputes {
        uuid id PK
        uuid round_id FK, UK
        text status
    }
```

Database constraints enforce one application per candidate and job, and at most one manual dispute per round.
The schema also contains sessions, temporary auth records, provider events, private notes, operator cases, and maintenance runs.
Apply the [ordered migrations](db) rather than a diagram as the schema definition.

## Local setup

Use Node.js 22, npm 10 or later, and Docker Compose for the local PostgreSQL 17 service.
The package supports Node.js versions from 22 up to, but excluding, 25.

1. Clone the repository.
2. Enter its directory.
3. Install the locked dependencies.

```sh
git clone https://github.com/kandulanikhilvarma/fairstage.git
cd fairstage
npm ci
```

4. Copy `.env.example` to `.env.local`.

```sh
cp .env.example .env.local
```

On PowerShell, use `Copy-Item .env.example .env.local` instead.

5. Start the local database.

```sh
docker compose up -d
```

The example file matches the Compose database. Its local defaults are:

```dotenv
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://fairstage:fairstage@localhost:5432/fairstage
DEFAULT_CURRENCY=INR
```

Use these database credentials only for local development.
Leave payment flags disabled during ordinary development.
The migration CLI needs an explicit environment file; Next.js loads `.env.local` for the app.

6. Apply all migrations.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
```

7. Start the development server.

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000).
Password registration creates an unverified account.
Email verification must succeed before job, application, round, or money writes.
Google and email-link access need their service credentials.
The local preparation guide and public interview formats work without a model service.

Use the [contributor guide](CONTRIBUTING.md) for disposable test databases and full account-flow verification.

## Configuration

[`.env.example`](.env.example) is the complete configuration reference.
Store production values in secure deployment controls. Never commit an environment file or provider secret.

| Service           | Variables                                                                                                                        | Required condition                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Core accounts     | `APP_URL`, `DATABASE_URL`                                                                                                        | Exact app origin and a migrated database                         |
| Direct migrations | `DATABASE_DIRECT_URL`                                                                                                            | Optional direct URL; otherwise use `DATABASE_URL`                |
| Display currency  | `DEFAULT_CURRENCY`                                                                                                               | `USD` or `INR`; no automatic conversion                          |
| Google            | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                       | Web OAuth client with `{APP_URL}/api/auth/google/callback`       |
| Email             | `RESEND_API_KEY`, `EMAIL_FROM`                                                                                                   | Verified sender for sign-in, verification, and recovery          |
| Operator review   | `OPERATOR_EMAILS`                                                                                                                | Exact addresses on the allowlist, with verified accounts         |
| Maintenance       | `CRON_SECRET`                                                                                                                    | 32 to 256 random URL-safe characters                             |
| INR payments      | `RAZORPAY_PAYMENTS_ENABLED`, `RAZORPAY_ROUTE_ENABLED`, and Razorpay credentials                                                  | Both flags plus approved merchant, Route, and candidate accounts |
| USD payments      | `LIVE_PAYMENTS_ENABLED`, Stripe credentials, `STRIPE_PLATFORM_COUNTRY`, `STRIPE_FUNDS_FLOW_APPROVED`, `STRIPE_CONNECT_COUNTRIES` | Approved jurisdiction outside India and accepted funds flow      |
| Optional model    | `AI_BASE_URL`, `AI_MODEL`, optional `AI_API_KEY`                                                                                 | HTTPS OpenAI-compatible endpoint and explicit user consent       |

Production database URLs must verify the server certificate and hostname with `sslmode=verify-full`.
Use a pooled runtime connection and an optional direct migration connection.
The configuration flags show availability from settings; they do not prove successful provider acceptance.
Follow [the launch guide](docs/LAUNCH.md) for the complete provider variable names and acceptance checks.

## API map

Protected routes use the `fs_session` cookie.
Browser POST requests need the exact `APP_URL` origin.
Routes with input fields require an `application/json` body.
Provider webhooks instead require a signature over the raw body.
The [API guide](docs/API.md) documents request fields, pagination, authorization, and error responses.

| Area                   | Representative routes                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability           | `GET /api/health`, `GET /api/config`                                                                                                            |
| Accounts               | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`                                                                      |
| Google and email       | `POST /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/magic/start`, `POST /api/auth/magic/verify`                           |
| Roles and applications | `GET /api/jobs`, `POST /api/jobs`, `POST /api/jobs/:id/apply`, `POST /api/applications/:id/status`                                              |
| Workspace              | `GET /api/workspace`, `GET /api/workspace/:collection`, `POST /api/profile`                                                                     |
| Rounds                 | `POST /api/rounds`, `POST /api/rounds/:id/accept`, `POST /api/rounds/:id/fund`, `POST /api/rounds/:id/complete`, `POST /api/rounds/:id/release` |
| Private records        | `GET /api/rounds/:id/notes`, `POST /api/rounds/:id/notes`, `GET /api/rounds/:id/calendar`                                                       |
| Exports                | `GET /api/ledger/export`, `GET /api/account/export`                                                                                             |
| Provider events        | `POST /api/webhooks/stripe`, `POST /api/webhooks/razorpay`                                                                                      |
| Operator review        | `GET /api/operator/cases`, `GET /api/operator/cases/:kind/:id`, `POST /api/operator/cases/:kind/:id`                                            |
| Maintenance            | `GET /api/internal/maintenance` with the configured bearer secret                                                                               |

Without database configuration, account APIs return HTTP 503.
`/api/config` and `/api/health` remain available for service diagnostics.
A successful health response verifies database access and the release version, not merchant approval.

## Verification

Run the application checks before browser checks:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

| Check                        | What it establishes                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| ESLint and TypeScript        | Source rules and static types                                                                         |
| Vitest and PGlite            | Domain, auth, API, ownership, money states, replay, and rollback behavior                             |
| PostgreSQL concurrency tests | Cross-connection ownership races against an isolated database                                         |
| SQL migration checks         | Ordered schema application to PostgreSQL 17 in CI                                                     |
| Playwright and axe           | Public pages, account workflows, operator controls, mobile targets, and selected accessibility checks |
| Production build             | Next.js compilation and route generation                                                              |

The recorded release passed 307 unit and API tests, 21 browser checks, and six migrations in CI.
See [the evaluation](docs/EVALUATION.md) for the exact source and successful CI run.
Local concurrency and authenticated browser cases skip without their dedicated PostgreSQL settings.
The [contributor guide](CONTRIBUTING.md) explains those settings and test isolation.

Provider mocks and local fixtures do not establish live email delivery, merchant approval, or bank settlement.
Provider acceptance and production account flows need separate checks.

## Deploy and operate

Vercel deploys the verified `main` branch through the connected GitHub repository.
Production needs a durable migrated database, HTTPS origin, and secure service configuration.
Preview deployments need their own database and appropriate test credentials.

1. Configure production services through secure environment controls.
2. Apply the migrations before account traffic.
3. Run the required acceptance checks.
4. Confirm CI passes on the exact pull request head.
5. Save the pre-merge base.
6. Squash-merge the verified change.
7. Confirm the Vercel deployment and source commit.
8. Check the public health, service flags, and affected flows.

Run the readiness CLI from the repository root with the production environment:

```sh
node --env-file=.env.local --import tsx scripts/check-readiness.ts --database --live
```

This command reads service status and migration records. It performs no money action and prints no credential values.
Exit code 1 means a required setting or requested check did not pass.
Use a secure environment file for this command; do not reuse local development settings as production acceptance.

The daily maintenance route has a 03:00 UTC schedule in [`vercel.json`](vercel.json).
It needs the database and `CRON_SECRET` before it can complete cleanup.
Provider pause flags stop new money actions while signed events continue reconciliation.
Keep database and financial records intact during an incident.

Complete merchant review, candidate account checks, hosting suitability, contracts, taxes, backups, and support procedures before commercial use.
See [launch](docs/LAUNCH.md), [operations](docs/OPERATIONS.md), and [deployment evidence](docs/DEPLOYMENT.md).

## Roadmap

The first stage includes individual accounts, paid-round workflows, complete exports, and operator review.
Team seats, subscriptions, tax invoices, calendar sync, ATS integration, and email alerts remain later work.
The release has no automatic dispute decisions or salary deductions.

Use [the roadmap](docs/ROADMAP.md) for acceptance gates.
Use [first-stage delivery](docs/FIRST_STAGE.md) for implemented scope and deferred external activation.

## Documentation

| Guide                                       | Purpose                                                               |
| ------------------------------------------- | --------------------------------------------------------------------- |
| [Product plan](docs/PLAN.md)                | Product rules, illustrative prices, and release steps                 |
| [Design system](DESIGN.md)                  | Brand, colors, type, layouts, and control states                      |
| [Architecture](docs/ARCHITECTURE.md)        | Modules, authentication, data boundaries, and failure recovery        |
| [API](docs/API.md)                          | Routes, request fields, scope, pagination, and errors                 |
| [Money rules](docs/MONEY.md)                | Fees, funds flow, refunds, reversals, and provider limits             |
| [Launch guide](docs/LAUNCH.md)              | Service setup and provider acceptance                                 |
| [Operator guide](docs/OPERATIONS.md)        | Case review, incidents, reconciliation, backups, and privacy requests |
| [AI guide](docs/AI.md)                      | Model adapter, consent, and data scope                                |
| [First-stage delivery](docs/FIRST_STAGE.md) | Delivered features and external activation gates                      |
| [Roadmap](docs/ROADMAP.md)                  | Later features and their acceptance gates                             |
| [Evaluation](docs/EVALUATION.md)            | Recorded tests, limits, and pending checks                            |
| [Deployment](docs/DEPLOYMENT.md)            | Source mapping, public-domain evidence, and activation status         |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before a pull request.
Report a concrete problem with a reproducible example and non-sensitive records.
Keep changes focused. Add meaningful tests for authorization, payment-state changes, and duplicate requests.
Use a concise Conventional Commit message and your own author identity.

Contributions to this repository use Apache-2.0 under the [license](LICENSE).
Send security reports through the private process below.

## Security

Read [SECURITY.md](SECURITY.md) for supported scope, report details, and known boundaries.
Use [GitHub private vulnerability reporting](https://github.com/kandulanikhilvarma/fairstage/security/advisories/new) when available.
Otherwise, contact [kandulanikhilvarma@gmail.com](mailto:kandulanikhilvarma@gmail.com).
Do not put credentials, candidate records, or payment data in public issues.

The server uses hashed sessions, role and ownership checks, exact-origin writes, and signed provider events.
Google access checks PKCE, state, nonce, and signed identity claims.
Email links expire and work once in the requesting browser.
The security guide also records the current inline-script allowance in the Content Security Policy.

## License

Fairstage source and documentation use the [Apache License, Version 2.0](LICENSE).
Copyright 2026 Nikhilvarma Kandula. See [NOTICE](NOTICE) for the project notice.

Dependencies, external services, and separately obtained model weights retain their own licenses and terms.
The project license does not grant trademark rights or access to hosted service accounts.

To cite the software or product model, use [`CITATION.cff`](CITATION.cff).

---

[LinkedIn](https://www.linkedin.com/in/nikhilvarmakandula) · [Email](mailto:kandulanikhilvarma@gmail.com) · [Portfolio](https://kandula.studio)
