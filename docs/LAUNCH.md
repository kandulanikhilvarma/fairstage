# Launch guide

The public site starts in demo mode.
Do not treat a successful deployment as approval for real payments.

## Required owner decisions

- Choose the operating company and support contact.
- Choose the first supported employer and candidate countries.
- Approve pilot amounts and employer fees.
- Review candidate contracts, pay obligations, tax, and privacy notices.
- Confirm provider acceptance of this funds flow.
- Set a dispute review process and a response target.
- Check the Fairstage name before commercial use.

## Environment

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact trusted origin and provider return URL |
| `DEMO_MODE` | Use `true` for the public demo. Use `false` for real accounts. |
| `DATABASE_URL` | PostgreSQL connection with the provider's verified TLS configuration |
| `LIVE_PAYMENTS_ENABLED` | Explicit gate for checkout and transfers |
| `STRIPE_SECRET_KEY` | Server key for the selected Stripe environment |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for this endpoint and environment |
| `STRIPE_CONNECT_COUNTRIES` | Comma-separated countries approved for this pilot |
| `RESEND_API_KEY` | Server credential for verification and reset emails |
| `EMAIL_FROM` | Verified sender address |
| `AI_BASE_URL` | Optional endpoint base URL, usually with `/v1` |
| `AI_API_KEY` | Optional credential for the model endpoint |
| `AI_MODEL` | Model name chosen by the owner |

Do not commit `.env.local` or paste secret values into issues.
Use distinct credentials for test and live environments.

## Database

1. Create a managed PostgreSQL database.
2. Configure encrypted transport with certificate validation.
3. Set `DATABASE_URL` in the deployment environment.
4. Apply `scripts/migrate.ts` with the same database URL.
5. Enable backups and test a restore.
6. Limit the runtime account to the app's required tables.

The migration uses a transaction and advisory lock.
The migration table records each applied file.
Do not edit an applied migration. Add a new migration for later schema changes.

## Stripe test acceptance

Subscribe `/api/webhooks/stripe` to these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `account.updated`
- `charge.refunded`
- `charge.dispute.created`

1. Create separate test employer and candidate accounts.
2. Verify both email addresses.
3. Complete candidate Connect setup in an approved country.
4. Offer a round with a future start time.
5. Accept the terms as the candidate.
6. Fund the round with a provider test card.
7. Confirm the signed event changes the round to funded.
8. After the round ends, confirm completion from both accounts.
9. Release pay once.
10. Retry the release and webhook events.
11. Confirm exactly one transfer and release record.
12. Test a failed payment, partial refund, full refund, and dispute.
13. Confirm the operator can detect and review a failed transfer reversal.

An API test with a mocked Stripe client does not satisfy these provider checks.

## Vercel

1. Import the public GitHub repository into Vercel.
2. Keep the project root at the repository root.
3. Use the Next.js preset and Node.js 22.
4. Set the required environment variables.
5. Deploy the verified main branch.
6. Confirm `/api/health` and the app pages on the production domain.
7. Confirm `APP_URL` matches that domain before any live POST request.

The default deployment needs no secrets and remains a safe interactive demo.

## Launch acceptance

Record evidence for each database, email, provider, and country check.
Run the complete local and CI checks.
Confirm the public privacy notice names the operator and request process.
Test a restore and a payment incident.
Only then approve the move from a demo to a commercial pilot.
