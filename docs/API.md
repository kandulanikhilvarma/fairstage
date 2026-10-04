# API guide

The API uses JSON except for calendar files, CSV exports, and provider webhooks.
JSON responses contain `{ "error": "..." }` on failure.
Protected routes need the `fs_session` cookie.
Successful password, Google, and email-link sign-in create a 7-day session.
Cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

POST requests need an `Origin` header that matches the origin of `APP_URL`.
Provider webhooks use signatures instead of the Origin check.
JSON requests need `Content-Type: application/json`.
The JSON body limit is 16,000 bytes.
Send `{}` to auth actions that have no input fields.

## Public routes and service flags

| Method | Route         | Response                                                                                                   |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/config` | Flags for `accounts`, `payments`, `google`, `magic`, `email`, `razorpay`, and `ai`; the default `currency` |
| GET    | `/api/health` | `status`, `mode: "production"`, and `version`; 200 for a database response, otherwise 503                  |
| GET    | `/api/jobs`   | `{ jobs, page }` with bounded open roles, newest first                                                     |

`config` and `health` work without a database.
Other routes need `DATABASE_URL`.
The API returns 503 without database configuration.
The `accounts` flag also needs a valid `APP_URL`.
Auth provider routes accept HTTPS origins and HTTP origins on loopback hosts.
The default currency is USD only when `DEFAULT_CURRENCY=USD`; otherwise it is INR.

Service flags show configuration, not a completed provider check.
The `ai` flag checks `AI_BASE_URL`; remote guidance also needs `AI_MODEL`.
The `payments` flag checks Stripe credentials and `LIVE_PAYMENTS_ENABLED=true`.
Production Stripe credentials must start with `sk_live_`.
Production Stripe actions also need `STRIPE_PLATFORM_COUNTRY` outside India and `STRIPE_FUNDS_FLOW_APPROVED=true`.
Signed webhook reconciliation does not depend on the new-action approval flags.

The `razorpay` flag needs both payment and Route enablement, live credentials, and a webhook secret.

## Complete payment export

`GET /api/ledger/export` returns all payment events for rounds that involve the signed-in account.
The CSV has no row limit and orders events by date and record ID.
The columns are Date, Event, Round ID, Amount, and Currency.
Amounts use two decimal places and keep their USD or INR currency.

The response downloads as `fairstage-payment-records.csv` with `Cache-Control: no-store`.
The durable rate limit permits five exports for each account each hour.
The export excludes provider references and account credentials.

## Sign-in and email ownership

| Method | Route                       | Input and result                                                                                    |
| ------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`        | `name`, `email`, `password`, `role`, optional `company`; 201 with an unverified account and session |
| POST   | `/api/auth/login`           | `email`, `password`; session and `{ message }`                                                      |
| POST   | `/api/auth/logout`          | Current session; deletes the session and cookie                                                     |
| POST   | `/api/auth/google`          | `role`; `{ url }` for Google's authorization page                                                   |
| GET    | `/api/auth/google/callback` | Provider query parameters and flow cookie; 303 redirect to `/workspace` or `/account?authError=...` |
| POST   | `/api/auth/magic/start`     | `email`, `role`, optional `name`; sends a sign-in link and sets a flow cookie                       |
| POST   | `/api/auth/magic/verify`    | `token` and flow cookie; session with `{ message, redirect: "/workspace" }`                         |
| POST   | `/api/auth/reset-request`   | `email`; same success message whether an account exists or not                                      |
| POST   | `/api/auth/verify-request`  | Current session; sends a verification link, or reports an already verified account                  |
| POST   | `/api/auth/token`           | `token`, `purpose`, optional `password`, `role`, `name`; consumes a reset or verification token     |

Account roles are `candidate` and `employer`.
Registration names contain 2 to 100 characters.
Registration passwords contain 12 to 128 characters.
Registration does not prove email ownership.

Unverified accounts can read their workspace and export their account data.
They can save a profile or ask for email verification.
They can also use preparation guidance or sign out.
Other protected POST actions return 403 until email verification succeeds.
The verification restriction includes jobs, applications, round actions, private notes, and payment setup.

Google sign-in needs `DATABASE_URL`, `APP_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.
The callback URI is `{APP_URL}/api/auth/google/callback`.
The flow expires after 10 minutes.
The server checks the authorization state, PKCE, nonce, token signature, audience, expiry, and verified email claim.

First-time Google access accepts Gmail or managed Workspace email ownership.
Other Google email addresses require an email link.
An existing Google subject remains linked to its account.

Google callback errors use these `authError` values:

| Value                 | Meaning                                              |
| --------------------- | ---------------------------------------------------- |
| `google_expired`      | Missing, expired, or invalid browser challenge       |
| `google_cancelled`    | Google returned an error after a valid challenge     |
| `email_link_required` | First-time access needs direct email ownership proof |
| `google_unavailable`  | Provider, token, configuration, or server failure    |

Email links need `RESEND_API_KEY` and `EMAIL_FROM`, plus the database and app origin.
Sign-in links expire after 15 minutes.
Open the link in the browser that requested it.
The matching flow cookie and token can authorize sign-in once.
Reset and verification links expire after 30 minutes.

The token purpose is `reset` or `verify`.
A reset needs a new password with 12 to 128 characters.
Verification of an unverified password account also needs a new password.
Successful reset revokes all sessions and auth tokens.
The client must sign in again.

A verified account keeps its existing role and credentials during email or Google sign-in.
Proof of email ownership can reclaim an unverified account.
The server disables its old password and revokes sessions and auth tokens.
The server replaces its role and name and clears public profile text.
Connected payout country and time zone remain unchanged.

## Account, jobs, and applications

| Method | Route                          | Actor and behavior                                                                   |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------ |
| GET    | `/api/workspace`               | Current account; `{ user, rounds, jobs, applications, ledger, disputes }`            |
| POST   | `/api/profile`                 | Current account; save profile fields without a role change                           |
| GET    | `/api/account/export`          | Current account; full JSON export of related records and the account's private notes |
| POST   | `/api/jobs`                    | Verified employer; create a role and return `{ id }` with 201                        |
| POST   | `/api/jobs/:id/close`          | Owning employer; close the role                                                      |
| POST   | `/api/jobs/:id/apply`          | Verified candidate; `note` with 20 to 3000 characters; 201                           |
| POST   | `/api/applications/:id/status` | Job owner changes status; candidate can withdraw their own application               |

The interface requests `/api/workspace?pageSize=50`.
The response includes `summary` and `pages` with the account collections.
The server computes totals over the complete account history.
The totals keep USD and INR separate.
The authenticated `user.operator` flag exposes no allowlist addresses.

`GET /api/workspace/:collection` returns `{ items, page: { nextCursor, total } }`.
Valid collections are `rounds`, `jobs`, `applications`, `ledger`, and `disputes`.
Use `pageSize` from 1 to 100 and the returned `cursor` for the next page.
The default page size is 50.

Optional `q` and `status` filters apply before the page limit.
Use only a cursor from the same account, collection, and filters.
Invalid cursors return 400.
Timestamp and UUID order preserves records with equal timestamps.

The legacy request without `pageSize` retains its previous caps for older clients.
Those caps are 200 rounds, applications, ledger entries, and disputes, plus 100 owned jobs.
The interface labels filters that apply only to loaded records.
Applications and public roles also have server search across complete matching records.
Public roles accept `pageSize`, `cursor`, `q`, and `category`.
Signed-in candidates receive an `applied` flag without public employer account IDs.
The account export has no row limit.
The export includes `user`, `applications`, `rounds`, `jobs`, `ledger`, `disputes`, `privateNotes`, and `exportedAt`.
The export omits password hashes and session tokens.
Only related records and the current account's private notes appear.

The wallet downloads its complete CSV from `/api/ledger/export`.
The export does not use the capped workspace ledger.

## Restricted operator routes

Every operator route needs a verified session and an exact address in `OPERATOR_EMAILS`.
An absent or invalid allowlist grants no operator access.
The write transaction checks the session again before the review.

| Method | Route                           | Response or action                                                        |
| ------ | ------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/operator/session`         | Operator identity and `financialActionsEnabled: false`                    |
| GET    | `/api/operator/health`          | Case counts, provider event times, and latest maintenance result          |
| GET    | `/api/operator/cases`           | `{ items, nextCursor }`; optional `kind`, `status`, `limit`, and `cursor` |
| GET    | `/api/operator/cases/:kind/:id` | `{ case, notes, nextCursor }`; optional `limit` and `cursor` for notes    |
| POST   | `/api/operator/cases/:kind/:id` | Review with `note`, `status`, `decision`, and `expectedVersion`           |

Kinds are `dispute` and `repair`.
The default limit is 25; permitted limits are 1 to 50.
Review states are `open`, `in_review`, `waiting_provider`, and `closed`.
Decisions are `pending`, `needs_information`, `provider_review`, and `no_action`.
The API validates the permitted state and decision pairs.

Notes contain 10 to 3000 characters.
A stale version returns 409.
Responses have `Cache-Control: no-store`.

Review writes use the Origin, JSON body, and durable rate-limit checks.
Each review adds an immutable case event and an audit event.
Review closure leaves original dispute, round, and ledger states intact.

## Scheduled maintenance

`GET /api/internal/maintenance` needs `Authorization: Bearer CRON_SECRET`.
The secret must contain 32 to 256 URL-safe characters.
The endpoint denies unauthorized requests before database access.
The daily Vercel schedule runs at 03:00 UTC.
Vercel sends the configured secret in the Authorization header. [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

The transaction lock prevents overlapping cleanup runs.
Each table has a 1000-row batch limit.
The job removes expired temporary credentials and rate limits after a one-day grace period.
It preserves permanent records and financial history.
The database records counts and completion times in `operation_runs`.
An overlapping run returns `status: skipped`.
A database failure returns 503 without private error details.

Profile input contains `name`, `company`, `bio`, and a two-letter uppercase `country`.
Optional fields are `headline`, `skills`, `portfolioUrl`, `resumeUrl`, and `timezone`.
The headline limit is 120 characters.
The skills limit is 20 entries with 1 to 50 characters each.
Portfolio and resume URLs must use HTTPS, or be empty.
The server checks the time zone through `Intl.DateTimeFormat`.

Country changes need support after a Stripe or Razorpay account link exists.

Job input contains `title`, `location`, `category`, `description`, `salaryMin`, `salaryMax`, `stages`, and optional `currency`.
Categories are `Engineering`, `Design`, `Product`, and `Operations`.
The description contains 30 to 8000 characters.
The stage count is 1 to 5.
Salary bounds are whole numbers from 0 to 100,000,000.
The maximum salary must equal or exceed the minimum salary.

Job currency defaults to INR.

Application status input is `{ "status": "interviewing" }`.
Employers can select `reviewing`, `interviewing`, `offered`, `hired`, or `rejected`.
Candidates can select only `withdrawn`.
Candidates cannot withdraw an application after a hire or an earlier withdrawal.
Employers cannot change withdrawn applications.

Unavailable or unrelated applications return 404.
An application to a closed job or a duplicate application returns 409.

## Paid rounds and private records

| Method | Route                      | Actor and behavior                                                                       |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/api/rounds`              | Verified employer; offer a round to an existing candidate account; `{ id }` with 201     |
| POST   | `/api/rounds/:id/accept`   | Candidate participant; accept an offered round                                           |
| POST   | `/api/rounds/:id/fund`     | Employer participant; start the selected provider's payment flow                         |
| POST   | `/api/rounds/:id/complete` | Either participant; confirm a funded round after its scheduled end                       |
| POST   | `/api/rounds/:id/release`  | Either participant; request payment release after both confirmations                     |
| POST   | `/api/rounds/:id/cancel`   | Either participant; cancel an offered or accepted round with no unresolved payment order |
| POST   | `/api/rounds/:id/dispute`  | Either participant; `reason` with 20 to 3000 characters; block release                   |
| GET    | `/api/rounds/:id/notes`    | Either participant; `{ note }` for their own private note                                |
| POST   | `/api/rounds/:id/notes`    | Either participant; `note` with at most 5000 characters                                  |
| GET    | `/api/rounds/:id/calendar` | Either participant; `text/calendar` attachment named `interview.ics`                     |

Round creation accepts this body:

```json
{
  "candidateEmail": "candidate@example.test",
  "title": "Product designer",
  "kind": "Skills interview",
  "minutes": 60,
  "amountCents": 4500,
  "currency": "USD",
  "scheduledAt": "2026-10-10T15:00:00Z",
  "meetingUrl": "https://example.test/meeting",
  "terms": "Discuss one project within the agreed time. Pay stays independent of the hire decision."
}
```

Use a future date at least 15 minutes after the request.
Round kinds are `Introduction`, `Skills interview`, and `Work sample`.
Round duration is 15 to 180 minutes.
The terms contain 20 to 3000 characters.
The meeting URL must use HTTPS.

Round currency is USD or INR and defaults to USD.
Amounts use integer minor units: USD cents or INR paise.
The amount range is 500 to 1,000,000 minor units.
The server calculates the 8% fee and derives the employer ID from the session.
Client fee and provider values do not select the payment route.

Round creation fixes the provider: USD uses Stripe; INR uses Razorpay.
Both completion confirmations change the round to `completed`.
A dispute changes a funded or completed round to `disputed`.
Release requires a ready recipient account and a provider-confirmed payment.
The server blocks release for open disputes or provider records that need review.

Calendar files contain the UTC start and end, round title, terms, and meeting URL.
Private notes never appear in the other participant's note response or account export.

## Payment providers and preparation

| Method | Route                    | Input and result                                                             |
| ------ | ------------------------ | ---------------------------------------------------------------------------- |
| POST   | `/api/connect`           | Verified candidate in an allowed country; `{ url }` for Stripe Express setup |
| POST   | `/api/razorpay/verify`   | Employer; confirm the round's order, payment, and signature                  |
| POST   | `/api/assistant`         | Current account; `topic`, `kind`, `consent`; `{ text, source }`              |
| POST   | `/api/webhooks/stripe`   | Raw signed Stripe event; `{ received: true }` on success                     |
| POST   | `/api/webhooks/razorpay` | Raw signed Razorpay event; `{ received: true }` on success                   |

Stripe payment actions need `LIVE_PAYMENTS_ENABLED=true` and `STRIPE_SECRET_KEY`.
Production requires a live key.
Candidate setup also needs the account's country in `STRIPE_CONNECT_COUNTRIES`.
The provider must confirm submitted account details, enabled payouts, and active transfers before it accepts payment.
Stripe payment setup returns `{ url }` for Checkout.
The Checkout return page does not prove payment.

Signed webhook events reconcile confirmed payments and ledger records.

Razorpay actions need merchant activation and Route approval.
Configuration needs `RAZORPAY_PAYMENTS_ENABLED=true`, `RAZORPAY_ROUTE_ENABLED=true`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
Production requires a key that starts with `rzp_live_`.
The candidate needs an approved, active linked account.
Razorpay payment setup returns `{ checkout: { key, orderId, amount, currency, name, description } }`.
Verification input contains `roundId`, `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.

The server checks the signature and fetches the provider payment before it records payment.
Razorpay marks payment as `paid` only after a processed transfer.
Provider settlement follows the provider's schedule.

Stripe webhooks need `stripe-signature`, Stripe credentials, and `STRIPE_WEBHOOK_SECRET`.
Razorpay webhooks need `x-razorpay-signature`, `x-razorpay-event-id`, and Razorpay credentials with the webhook secret.
The webhook body limit is 1,000,000 bytes.
Webhook reconciliation remains available when the operator disables outbound payment actions.
Event IDs prevent duplicate reconciliation.

Preparation topics contain 3 to 500 characters.
The kind limit is 50 characters.
Without both `AI_BASE_URL` and `AI_MODEL`, the assistant returns a local guide.
Remote guidance needs explicit consent and an HTTPS endpoint in production.
`AI_API_KEY` is optional and depends on the configured service.

## Errors and rate limits

| Status | Exact error example and cause                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| 400    | `Choose a time at least 15 minutes from now.`; invalid input or provider signature                                  |
| 401    | `Sign in to continue.` or `Your session expired. Sign in again.`; absent or expired session                         |
| 401    | `The email or password is not correct.`; rejected password sign-in                                                  |
| 403    | `The request origin is not permitted.`; wrong or missing Origin                                                     |
| 403    | `Your account cannot do this action.`; wrong account role                                                           |
| 403    | `Verify your email before you use applications or interview rounds.`; protected write from an unverified account    |
| 404    | `The round does not exist.`, `The application is not available.`, or `The API route does not exist.`                |
| 409    | `This action is not available for the current round state.`; state conflict, duplicate action, or provider mismatch |
| 413    | `The request is too large.` or `The event is too large.`; body limit exceeded                                       |
| 415    | `Use an application/json request.`; wrong JSON content type                                                         |
| 429    | `Too many requests. Try again later.`; rate limit exceeded                                                          |
| 500    | `The request could not complete. Try again later.`; unexpected failure on the main API router                       |
| 500    | `Sign-in could not complete. Try again.`; unexpected failure on Google or email-link POST routes                    |
| 502    | `The AI service did not answer. Try the local guide later.`; remote AI rejection                                    |
| 503    | `The account service is temporarily unavailable. Please try again later.`; missing database configuration           |
| 503    | `Google sign-in is being configured.` or `Email sign-in is being configured.`; missing auth configuration           |
| 503    | `Payments are not configured. Contact support.`; disabled Stripe payment actions or missing credentials             |
| 503    | `Razorpay payments need merchant activation and Route approval. Contact support.`; Razorpay gate not ready          |

Schema failures on the main router return the first validation message with 400.
Google and email-link POST schema failures return `Check the sign-in form values.` with 400.
Unexpected main-router failures include `requestId` in the JSON response.
Dedicated auth routes and webhooks use their own error responses without that field.
Server logs omit request bodies, passwords, and auth tokens.

| Request group                                 | Limit                     |
| --------------------------------------------- | ------------------------- |
| Password auth requests by IP                  | 20 requests in 15 minutes |
| Password login by email                       | 10 requests in 15 minutes |
| Google or email-link actions by method and IP | 20 requests in 15 minutes |
| Email-link requests by email                  | 3 requests in 15 minutes  |
| Verification requests by account              | 3 requests in 1 hour      |
| Protected POST requests by account            | 100 requests in 1 minute  |
| Preparation requests by account               | 20 requests in 1 hour     |
| Full account exports by account               | 5 requests in 1 hour      |

Resource IDs use UUIDs.
The server derives record ownership from the current session.
Unrelated private records return 404 rather than another account's data.
