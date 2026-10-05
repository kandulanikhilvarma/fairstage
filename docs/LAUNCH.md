# Launch guide

Account service, email service, and payment service have separate activation checks.
A successful build does not establish merchant approval.
Keep each payment flag disabled until the corresponding provider checks pass.

## Owner decisions

- Name the operating company and support contact.
- Approve employer and candidate countries.
- Approve interview amounts and the platform fee.
- Review candidate contracts, taxes, and privacy notices.
- Confirm provider acceptance of the interview payment flow.
- Set the dispute review process and response target.
- Check the rights to the Fairstage name before commercial use.

## Environment

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact trusted origin and provider return origin |
| `DATABASE_URL` | PostgreSQL connection with verified TLS |
| `DATABASE_DIRECT_URL` | Direct connection for PostgreSQL migrations; the same TLS checks apply |
| `DEFAULT_CURRENCY` | `INR` or `USD` for new forms |
| `GOOGLE_CLIENT_ID` | Google OAuth web client identifier |
| `GOOGLE_CLIENT_SECRET` | Google OAuth credential for the server |
| `RESEND_API_KEY` | Credential for email links, verification, and password reset |
| `EMAIL_FROM` | Verified sender address |
| `RAZORPAY_PAYMENTS_ENABLED` | Explicit gate for Razorpay payments |
| `RAZORPAY_ROUTE_ENABLED` | Explicit gate for approved Route transfers |
| `RAZORPAY_KEY_ID` | Public checkout identifier and server account identifier |
| `RAZORPAY_KEY_SECRET` | Razorpay credential for the server |
| `RAZORPAY_WEBHOOK_SECRET` | Signature secret for this webhook endpoint |
| `LIVE_PAYMENTS_ENABLED` | Explicit gate for Stripe checkout and transfers |
| `STRIPE_SECRET_KEY` | Stripe credential for the server |
| `STRIPE_WEBHOOK_SECRET` | Signature secret for this Stripe endpoint |
| `STRIPE_CONNECT_COUNTRIES` | Candidate countries that the operator and Stripe approve |
| `STRIPE_PLATFORM_COUNTRY` | Approved platform country outside India for this transfer model |
| `STRIPE_FUNDS_FLOW_APPROVED` | Explicit provider approval of the separate charges and transfers |
| `AI_BASE_URL` | Optional HTTPS endpoint base URL |
| `AI_API_KEY` | Optional credential for the model service |
| `AI_MODEL` | Model identifier chosen by the owner |

Do not commit `.env.local` or put secret values in issues.
Use separate databases and provider credentials for acceptance environments.
Do not point preview deployments at the production database.
Production payment routes require live provider keys.

## Database

1. Create a managed PostgreSQL database.
2. Configure encrypted transport with certificate validation.
3. Set `DATABASE_URL` in the deployment environment.
4. Apply all SQL migrations with `scripts/migrate.ts`.
5. Confirm the migration registry contains each file.
6. Enable backups.
7. Test a restore.
8. Limit the runtime account to the required tables.

The migration uses a transaction and advisory lock.
The migration registry records each applied file.

Use `sslmode=verify-full` in both production connection URLs.
The app checks the installed PostgreSQL parser's effective TLS settings.
The app rejects settings that omit certificate or hostname verification.
An optional direct URL must pass the same checks before a runtime or migration connection.
HTTP loopback apps with loopback databases can use the local development and CI fixtures.

Do not edit an applied migration.
Add a new migration for later schema changes.

## Account acceptance

1. Set the exact HTTPS `APP_URL` for the public deployment.
2. Create separate candidate and employer accounts.
3. Confirm unauthenticated requests cannot read workspace records.
4. Confirm one employer cannot read another employer's applicants.
5. Save the headline, skills, work links, country, and time zone.
6. Confirm invalid URLs and time zones fail validation.
7. Download the account export.
8. Confirm the export contains only authorized records.
9. Sign out.
10. Confirm the expired session cannot read the workspace.

## Google sign-in

1. Create a Google OAuth web client.
2. Configure the consent screen for the operator.
3. Add the exact `APP_URL` origin.
4. Register `APP_URL/api/auth/google/callback` as an authorized redirect URI.
5. Set the client ID and secret in Vercel.
6. Sign in with an approved Google account.
7. Confirm the workspace uses the stored role.
8. Try a callback with invalid state.
9. Confirm the invalid callback creates no session.
10. Test account cancellation and an expired challenge.

Google returns identity data under the `openid email profile` scope.
The app does not request Drive, Gmail, or calendar access.
New identities with non-Gmail email addresses need a managed Workspace claim or an email sign-in link.
See [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

## Email sign-in and verification

1. Verify the sender domain with Resend.
2. Set the Resend key and `EMAIL_FROM`.
3. Request an email sign-in link.
4. Open the link in the same browser.
5. Confirm sign-in through the account button.
6. Confirm the link fails on a second use.
7. Confirm another browser cannot use the link.
8. Test delivery failure.
9. Test email verification for a password account.
10. Test password reset and previous-session invalidation.

The app does not consume a link through a GET request.
Email scanners cannot consume the token through a page visit.
The link expires after 15 minutes.

Verified accounts keep their stored role and profile.
The first proof of email ownership replaces an unverified account's password, sessions, tokens, and untrusted profile.
The owner chooses the account type at that first verification.
Financial records and provider mappings remain intact.
The owner must set a fresh password for the first password-account verification.

## INR payments with Razorpay Route

Razorpay Route needs an approved merchant and verified linked accounts.
A gateway account alone does not establish transfer eligibility.
Current Route eligibility includes turnover evidence and review of the proposed payer-payee relationship. [Razorpay Route requirements](https://razorpay.com/docs/payments/route/).

1. Activate the merchant account.
2. Submit the interview payment flow for provider review.
3. Confirm Route approval.
4. Complete the candidate's linked account verification through the approved provider process.
5. Confirm that the linked account belongs to the candidate.
6. Record the approved mapping through the operator procedure.
7. Keep that mapping outside candidate-editable forms.
8. Configure `/api/webhooks/razorpay`.
9. Set the endpoint secret.
10. Enable the provider gates only after acceptance.

The operator must check approved payment methods and fees in the provider account.
Provider settlement timing does not follow from the app's release status.
See [Razorpay pricing](https://razorpay.com/pricing/).

The implemented payment events include:

- `payment.captured`
- `order.paid`
- `payment.failed`
- `refund.processed`
- `payment.dispute.created`
- `payment.dispute.lost`
- `payment.dispute.won`
- `transfer.processed`
- `transfer.failed`
- `transfer.reversed`

Route transfer events contain a transfer entity.
Confirm the selected transfer events in the approved provider account.
The endpoint checks `x-razorpay-signature` over the original body.
The endpoint uses `x-razorpay-event-id` to prevent replay.

## USD payments with Stripe

Stripe India does not support separate charges and transfers or standalone transfers to connected accounts.
The India operator must keep USD payments disabled.
An invitation or a live key does not remove this restriction. [Stripe India marketplace limits](https://support.stripe.com/questions/stripe-india-support-for-marketplaces).
This release needs a Stripe-approved platform jurisdiction and transfer model before USD activation.
A test key does not establish access to a commercial platform.
Confirm the platform can support this interview payment flow and the selected candidate countries. [Stripe India requirements](https://docs.stripe.com/india-accept-international-payments).

Subscribe `/api/webhooks/stripe` to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `account.updated`
- `charge.refunded`
- `charge.failed`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `transfer.reversed`

1. Configure the approved Stripe account.
2. Set the endpoint-specific webhook secret.
3. Set the approved candidate countries.
4. Check the candidate email verification.
5. Complete the hosted candidate account setup.
6. Confirm transfer readiness from the provider.
7. Enable the Stripe gate only after acceptance.

Production actions also need `STRIPE_PLATFORM_COUNTRY` outside India and `STRIPE_FUNDS_FLOW_APPROVED=true`.
These values record approval; they cannot establish provider approval by themselves.

The endpoint verifies the original body with `stripe-signature`.
The endpoint rejects events from a different Stripe environment.

## Provider acceptance

Use an isolated development environment for provider sandbox checks.
Mocked clients do not satisfy provider acceptance.

1. Offer a round with a future start time.
2. Accept the terms as the candidate.
3. Fund the round with the provider's permitted test method.
4. Confirm the captured amount and currency match the offer.
5. Confirm the signed event updates the round.
6. Wait until the scheduled round ends.
7. Record completion from both accounts.
8. Release candidate pay once.
9. Repeat the release request.
10. Replay the provider event.
11. Confirm one transfer and one release record.
12. Test payment failure.
13. Test partial and full refunds.
14. Test a transfer reversal.
15. Open a dispute.
16. Confirm the dispute stops a pending release.
17. Confirm the operator can reconcile an uncertain provider request.

## Vercel and public-domain acceptance

1. Connect the GitHub repository to the existing Vercel project.
2. Use the Next.js preset and Node.js 22.
3. Set the production variables through secure environment controls.
4. Apply the migrations before account traffic.
5. Deploy the verified main branch.
6. Confirm the deployment reaches Ready.
7. Confirm the source commit matches the merged release.
8. Check `/api/health` on the public domain.
9. Check `/api/config` for actual service availability.
10. Confirm `APP_URL` matches the public origin.
11. Check the visible controls and keyboard focus.
12. Check the candidate and employer flows on the public app.

Public-domain checks must not create unapproved financial transactions.
Record the source commit in [the deployment record](DEPLOYMENT.md).
Record the checks and pending service gates there.

## Commercial acceptance

The current Vercel project uses the Hobby plan.
Vercel restricts Hobby to personal, non-commercial use.
Select a commercial hosting plan before a paid launch. [Vercel Hobby policy](https://vercel.com/docs/plans/hobby).
The release does not buy a hosting upgrade.

Record evidence for each account, email, provider, and country check.
Run the complete local and CI checks.
Confirm the public privacy notice names the operator and request process.
Test the database restore and payment incident procedures.
Approve commercial payments only after the required checks pass.
