# Contributing to Fairstage

Fairstage pays candidates for agreed interview time.
Contributions must preserve candidate pay, account ownership, and accurate payment records.
Start with a specific problem and a small, reviewable change.

For security issues, use the private process in [SECURITY.md](SECURITY.md).
Public issues must contain no candidate records, credentials, or payment details.

## Choose a change

1. Read the [README](README.md) for the product and current service limits.
2. Check the [roadmap](docs/ROADMAP.md) for scope and acceptance gates.
3. Search open issues and pull requests for the same problem.
4. Open an issue for a large feature or change to the payment model.
5. Describe the proposed behavior and a concrete acceptance check.

Use non-sensitive examples that you create for the test.
Report an ordinary bug with its route, steps, expected result, and actual result.
For a visual bug, include the viewport size and browser version.
Remove all personal data from screenshots and logs.

## Local development

Use Node.js 22 and npm 10 or later.
Docker Compose supplies the repository's PostgreSQL 17 service.

```sh
git clone https://github.com/kandulanikhilvarma/fairstage.git
cd fairstage
git switch -c feat/your-change
npm ci
```

For an external contribution, fork the repository first.
Clone your fork instead of the owner repository.

1. Copy `.env.example` to `.env.local`.
2. Keep the payment flags disabled.
3. Keep provider credentials empty for ordinary local work.
4. Start the local database with `docker compose up -d`.
5. Confirm the database reports a healthy state with `docker compose ps`.
6. Set `APP_URL=http://localhost:3000` in `.env.local`.
7. Set `DATABASE_URL` to the local Compose database.
8. Keep `DATABASE_DIRECT_URL` empty for this local database.
9. Apply the migrations with the command below.
10. Start the development server.

```sh
node --env-file=.env.local --import tsx scripts/migrate.ts
npm run dev
```

Open `http://localhost:3000`.
Password accounts need the database.
Google sign-in and email links need their separate service credentials.
An unavailable service must remain unavailable in the interface.

The migration and readiness scripts do not load `.env.local` automatically.
Use `node --env-file` for those scripts, or supply environment variables through your shell.
Next.js loads `.env.local` for its development and production commands.
Never commit an environment file that contains credentials.

## Repository map

| Path                                    | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `app/`                                  | Public pages, protected pages, and API routes                   |
| `components/`                           | Forms, navigation, workspace views, and shared controls         |
| `lib/domain.ts`                         | Validation, currencies, fees, and permitted states              |
| `lib/security.ts`                       | Sessions, password checks, request limits, and origin checks    |
| `lib/auth-ownership.ts`                 | Verified ownership claims and account locks                     |
| `lib/payments.ts` and `lib/razorpay.ts` | Provider requests and event reconciliation                      |
| `lib/queries.ts`                        | Authorized pages and complete-history summaries                 |
| `lib/operator.ts`                       | Restricted review and audit notes                               |
| `db/`                                   | Ordered SQL migrations                                          |
| `tests/`                                | Unit, API, PGlite, and real PostgreSQL tests                    |
| `e2e/`                                  | Browser workflows and isolated interface fixtures               |
| `docs/`                                 | Product rules, architecture, launch steps, and observed results |

Read [AGENTS.md](AGENTS.md) before a source change.
For Next.js changes, read the relevant guide shipped with the installed Next.js package.
Read [the architecture](docs/ARCHITECTURE.md) before changes across modules.

## Product and data rules

- Keep candidate pay separate from the employer platform fee.
- Keep USD and INR totals separate.
- Do not add salary deductions or a candidate repayment debt.
- Do not replace unavailable providers with successful payment records.
- Check the actor, role, and resource ownership on the server.
- Keep private interview notes within their owner's scope.
- Preserve provider references, ledger records, and original audit signals.
- Require both participants' completion before a normal payment release.
- Keep operator review separate from financial corrections.
- Do not add automatic candidate scores or AI hire decisions.
- Keep an external model optional and subject to explicit consent.

See [the money rules](docs/MONEY.md) for state changes and recovery.
See [the operator guide](docs/OPERATIONS.md) for disputes and uncertain provider results.

## Database changes

Add a new numbered SQL file for a schema change.
Never edit a migration that another environment already applied.
The migration runner applies files in name order under a transaction and an advisory lock.
The `schema_migrations` table records each applied filename.

1. Apply the full migration set to a fresh disposable database.
2. Run the affected API and database tests.
3. Run the migration command again.
4. Confirm the second run does not repeat applied files.
5. Document deployment order and any data conversion in the pull request.

For production URLs, use TLS with certificate and hostname verification.
The optional direct URL must pass the same checks as the runtime URL.
See [the database launch steps](docs/LAUNCH.md#database).

## Verification

Run the normal source checks from the repository root:

```sh
npm run check
npx playwright install chromium
npm run test:e2e
git diff --check
```

`npm run check` runs ESLint, TypeScript, Vitest, and a production build.
Browser tests need a successful build and an available port.
Playwright starts its own server and refuses to reuse an existing server.
If another process uses port 3000, set `E2E_PORT` between 1024 and 65535.

The local unit suite uses PGlite for database behavior and mocks for providers.
Without `AUTH_TEST_DATABASE_URL`, the local suite skips four real PostgreSQL concurrency cases.
Without `E2E_DATABASE_URL`, the browser suite skips five authenticated database workflows.
Interface fixtures still check populated controls and error states.
Record skipped cases in the pull request.
A partial run is not a full database check.

If PGlite initialization fails under parallel resource pressure, run the tests serially:

```sh
npm test -- --maxWorkers=1 --no-file-parallelism
```

Do not increase test timeouts to hide a permission, lock, or provider-state defect.

### Complete local PostgreSQL checks

Use a disposable local database for these checks.
Browser tests create and delete test accounts and related records.
Concurrency tests create temporary schemas and drop those schemas after the run.
Do not use a database that contains records you need to keep.
Never use production data or a tunnel to a remote production database.

The test configuration permits only these hosts: `localhost`, `127.0.0.1`, or `[::1]`.
Both test URLs must name the database `fairstage` and contain no query string or fragment.
The PostgreSQL test role needs permission to create and remove its temporary schemas.

1. Start a fresh disposable Compose database.
2. Copy `.env.example` to `.env.test.local`.
3. Keep all external provider credentials empty in that file.
4. Keep all payment flags disabled in that file.
5. Set the local values below in that file.
6. Apply all migrations with the explicit environment file.
7. Run the full unit suite.
8. Build the app.
9. Run the browser suite with the same environment file.

```dotenv
APP_URL=http://127.0.0.1:4173
DATABASE_URL=postgresql://fairstage:fairstage@127.0.0.1:5432/fairstage
DATABASE_DIRECT_URL=
AUTH_TEST_DATABASE_URL=postgresql://fairstage:fairstage@127.0.0.1:5432/fairstage
E2E_DATABASE_URL=postgresql://fairstage:fairstage@127.0.0.1:5432/fairstage
E2E_PORT=4173
```

```sh
node --env-file=.env.test.local --import tsx scripts/migrate.ts
node --env-file=.env.test.local node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
node --env-file=.env.test.local node_modules/next/dist/bin/next build
node --env-file=.env.test.local node_modules/@playwright/test/cli.js test
```

Playwright overrides the app server's external service credentials and disables its payment gates.
The automated suite cannot prove merchant approval, email delivery, or bank settlement.
Use a separate owner-approved provider environment for those acceptance checks.
See [the launch guide](docs/LAUNCH.md#provider-acceptance).

GitHub CI uses PostgreSQL 17 for concurrency tests, migrations, and authenticated browser workflows.
Read the actual CI result before a merge.
See [the evaluation record](docs/EVALUATION.md) for release evidence and test limits.

### Tests for your change

| Change                      | Required evidence                                                             |
| --------------------------- | ----------------------------------------------------------------------------- |
| Authentication or ownership | Wrong user, expired session, replay, and concurrent ownership checks          |
| Money or provider events    | Amount, currency, recipient, duplicate request, rollback, and recovery checks |
| Database query or export    | Tenant isolation, complete history, cursor boundaries, and empty results      |
| Operator review             | Verified allowlist access, stale edits, audit history, and concurrent reviews |
| Interface behavior          | Keyboard use, desktop and mobile layout, loading state, failure, and retry    |
| Documentation               | Real paths, valid links, closed code fences, and GitHub-safe Mermaid diagrams |

Choose tests that prove the intended behavior.
Avoid tests that only repeat the implementation.
For Mermaid diagrams, use quoted labels for punctuation and separate edges instead of ampersand syntax.

## Commits and pull requests

Use your own author identity for an external contribution.
Maintainer commits use `Nikhilvarma Kandula <267753970+kandulanikhilvarma@users.noreply.github.com>`.
Use a concise Conventional Commit subject with at most 60 characters.
Use `feat:`, `fix:`, `docs:`, `chore:`, or `ci:` as appropriate.
Do not add AI author trailers or automated-tool attribution to commit messages.

Write the message to a file before the commit:

```sh
git commit -F path/to/commit-message.txt
```

Keep the message file outside the staged change.
Keep one concern in each pull request.
Do not add unrelated repository hardening to a product fix.

Include these details in the pull request:

- The concrete problem and new behavior.
- The checks that ran and their results.
- Any skipped tests and the reason.
- Screenshots for a visible change, with no personal data.
- New migrations, environment variables, or provider dependencies.
- Material limits that need separate acceptance.

Maintainers check the exact pull request head through CI before a squash merge.
Maintainers save the pre-merge base and read back the merged source and deployment results.
A local commit does not authorize a push, merge, or deployment by itself.

## Contribution license

Your contribution must contain material that you have the right to share.
Contributions to this repository use the [Apache License 2.0](LICENSE).
Preserve required third-party notices and attribution.
External model weights, dependencies, and services keep their own licenses and terms.
