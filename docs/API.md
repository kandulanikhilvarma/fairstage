# API guide

The API accepts JSON. Protected routes need a valid session cookie.
POST requests need an Origin header that matches `APP_URL`.
The API returns `{ "error": "..." }` on failure.

| Method | Route | Actor and behavior |
| --- | --- | --- |
| GET | `/api/config` | Public mode and capability flags |
| GET | `/api/health` | Public runtime and database health |
| GET | `/api/jobs` | Public open roles, limited to 100 |
| POST | `/api/auth/register` | Create an employer or candidate account |
| POST | `/api/auth/login` | Create a seven-day session |
| POST | `/api/auth/logout` | Delete the current session |
| POST | `/api/auth/reset-request` | Send a reset link through the configured email service |
| POST | `/api/auth/token` | Consume a reset or verification token |
| POST | `/api/auth/verify-request` | Request email verification for the current account |
| GET | `/api/workspace` | Return records that belong to the current account |
| POST | `/api/profile` | Save name, company, note, and country |
| POST | `/api/jobs` | Employer creates a role |
| POST | `/api/jobs/:id/close` | Owning employer closes a role |
| POST | `/api/jobs/:id/apply` | Candidate sends a note of 20 to 3000 characters |
| POST | `/api/rounds` | Employer offers a paid round to an existing candidate |
| POST | `/api/rounds/:id/accept` | Candidate accepts the terms |
| POST | `/api/rounds/:id/fund` | Owning employer gets a Stripe Checkout URL |
| POST | `/api/rounds/:id/complete` | Either owner confirms a completed round |
| POST | `/api/rounds/:id/release` | Either owner requests release after both confirmations |
| POST | `/api/rounds/:id/cancel` | Either owner cancels an unpaid round |
| POST | `/api/rounds/:id/dispute` | Either owner sends a reason and blocks release |
| POST | `/api/connect` | Verified candidate gets Stripe account setup |
| POST | `/api/assistant` | Current account requests preparation guidance |
| POST | `/api/webhooks/stripe` | Stripe sends a signed event over the raw body |

## Round input

```json
{
  "candidateEmail": "candidate@example.test",
  "title": "Product designer",
  "kind": "Skills interview",
  "minutes": 60,
  "amountCents": 4500,
  "scheduledAt": "2026-10-10T15:00:00Z",
  "meetingUrl": "https://example.test/meeting",
  "terms": "Discuss one project within the agreed time. Pay stays independent of the hire decision."
}
```

The API calculates the fee. The API does not trust a client-supplied fee or employer ID.
Money values use integer cents. Round amounts range from $5 to $10,000.
The next round must start at least 15 minutes after the request.

## Error status

| Status | Meaning |
| --- | --- |
| 400 | Input does not match the schema |
| 401 | Session is absent or expired |
| 403 | Role or Origin check failed |
| 404 | Resource is absent or belongs to another account |
| 409 | State conflict or duplicate action |
| 429 | Rate limit exceeded |
| 503 | Demo mode or a required service is not configured |

Unknown server failures return a request ID. Logs omit passwords and request bodies.
