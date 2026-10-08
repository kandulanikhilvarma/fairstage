# Security policy

Fairstage holds account, interview, application, and payment records.
Security reports must use a private channel so those records stay private.

## Report a vulnerability

Use [GitHub's private vulnerability report](https://github.com/kandulanikhilvarma/fairstage/security/advisories/new).
If that form is unavailable, email [kandulanikhilvarma@gmail.com](mailto:kandulanikhilvarma@gmail.com).
Use the subject `Fairstage security report`.
Do not post an exploit, secret, or personal record in a public issue or pull request.

Include these details:

- The affected route, file, or dependency.
- The source commit or package version.
- The environment and whether the problem affects the public deployment or local source.
- The smallest reproducible example with accounts and data that you control.
- The expected behavior and actual behavior.
- The impact, such as unauthorized record access or duplicate payment state.
- Redacted logs or screenshots, if they help establish the result.
- A contact method for private follow-up.

Do not email passwords, session cookies, identity documents, or payment credentials.
If an exposed credential is necessary to describe the issue, name its type and source without its value.
The maintainer can arrange a separate secure exchange if necessary.

The maintainer will assess the report and discuss a fix through the private channel.
The security policy sets no guaranteed response time, paid bounty, or service availability target.
Coordinate public disclosure after the maintainer can assess and fix the issue.

## Supported source

| Source                         | Security fixes                  |
| ------------------------------ | ------------------------------- |
| Current `main` branch          | Supported                       |
| Older tags, commits, and forks | No separate backport commitment |

Use the [deployment record](docs/DEPLOYMENT.md) to find the published source and observed service gates.
A published page or successful build does not establish account-service or payment-provider readiness.
See [the launch guide](docs/LAUNCH.md) for separate activation and acceptance checks.

## Safe report scope

Use your own isolated accounts and non-sensitive records for a reproduction.
Prefer a local disposable database and mocked providers.
Do not create a live charge, transfer, refund, or reversal to show an issue.
Do not change or download another person's records.
If you find another person's data, stop the test.
Report the route and a small amount of evidence privately.

Do not use denial-of-service tests, automated password guessing, bulk scraping, or social engineering against the public app.
Do not test Google, Resend, Razorpay, Stripe, Vercel, or another provider without that provider's permission.
Report a third-party service defect through its own security process.
The security policy does not authorize access beyond your accounts or override a provider's terms.

## Implemented controls

The controls below describe the current source.
They do not certify the deployed service or remove the need for review.

| Boundary             | Current implementation                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Accounts             | Salted scrypt passwords; hashed random session tokens; expiry checks on protected requests              |
| Cookies              | `HttpOnly`, `Secure` in production, and `SameSite=Lax`                                                  |
| Protected actions    | Server checks for role and resource ownership; exact-origin checks for browser writes                   |
| Request handling     | JSON type checks, bounded JSON bodies, schema validation, and shared database rate limits               |
| Google sign-in       | PKCE, browser-bound state and nonce, signed identity claims, expiry, issuer, and audience checks        |
| Email links          | Hashed secrets, a 15-minute expiry, browser binding, and one-time confirmation through POST             |
| First verified claim | Revocation of an unverified registrant's credentials, sessions, tokens, and untrusted profile values    |
| Ownership races      | Email advisory locks and session creation inside the ownership transaction                              |
| Database transport   | Certificate and hostname verification for production runtime and optional direct URLs                   |
| Payment state        | Transactions, round locks, provider validation, stable request references, and unique ledger references |
| Provider events      | Signature checks over the original body and replay protection                                           |
| Operator review      | Verified allowlist access, a session recheck, case locks, version checks, and append-only review notes  |
| Maintenance          | Bearer-secret authentication, a transaction lock, bounded expiry cleanup, and recorded outcomes         |
| Model output         | Escaped React text; explicit consent for an optional model request; no AI payment or hire decision      |

Read [the architecture](docs/ARCHITECTURE.md), [API guide](docs/API.md), and [money rules](docs/MONEY.md) for detailed boundaries.

## Known security limits

The Content Security Policy permits inline scripts for Next.js hydration.
The policy does not use a nonce.
The inline-script allowance limits protection against script injection.
Development mode also permits `unsafe-eval` for the development toolchain.
The app renders user and model content as escaped React text.
Do not describe the current policy as a strict nonce-based CSP.

An unverified password registration does not prove email ownership.
Production Google sign-in and email verification need configured services and separate acceptance checks.
Operator access needs both a verified account and an exact server allowlist match.

Provider mocks and UI fixtures do not prove payment approval or real settlement.
The app records a confirmed transfer to the candidate's provider account, not final bank receipt.
The operator must reconcile bank payouts through provider reports.

The release has no automatic dispute decision or public refund action.
Case closure does not release funds or clear the underlying participant dispute.
The optional model must not receive credentials, private notes, or identity documents.
High-volume exports and account histories need separate resource and load checks.

## Before real payment traffic

1. Complete [the launch acceptance checks](docs/LAUNCH.md).
2. Use separate credentials and databases for preview and provider acceptance environments.
3. Confirm merchant, country, and candidate-account approval.
4. Check signed event delivery and duplicate-request recovery.
5. Test a database restore in a separate environment.
6. Confirm the operating policy and private support process.
7. Enable each payment gate only after its acceptance checks pass.

The India operator cannot use this release's Stripe separate-transfer flow.
Keep USD actions disabled for that operator.
An approved Razorpay gateway account alone does not establish Route transfer eligibility.

## Maintainer incident process

Use [the operator guide](docs/OPERATIONS.md#pause-and-incident-response) for a payment incident.
Pause affected new money actions while you assess the issue.
Preserve financial history, provider references, signed events, and audit evidence.
An action pause does not cancel an earlier hosted checkout or request already in progress.

Keep valid reconciliation credentials available unless you suspect a credential leak.
If you suspect a credential leak, rotate the credential through the provider's approved process.
Review missed reconciliation separately.

Do not erase ledger entries or force a new idempotency key to repair an uncertain payment.
Confirm the real provider outcome before a corrective financial action.
Record the fix and its checks through the private report process before disclosure.
