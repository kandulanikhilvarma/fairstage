# Operator guide

## Health and logs

Check `/api/health` for the runtime mode.
Live mode also checks the database connection.
Set an external monitor for health failures and response time.
Set alerts for failed Stripe webhooks and database pool errors.

The API logs generic request IDs.
Webhook logs include the event ID and event type.
Do not add passwords, payment data, or complete request bodies to logs.

## Reconciliation

Compare funded ledger totals with captured provider charges each day.
Compare released totals with transfers to connected accounts.
Review disputed rounds and provider dispute events separately.
Review failed events in the Stripe Dashboard.
Resolve the cause before you replay an event.

The release distinguishes a transfer from a bank payout.
The app does not track every later bank payout event.
Use the provider's settlement report for final bank reconciliation.

## Dispute review

This release has no operator console or automated adjudication.
A live operator must use a restricted database procedure and the provider Dashboard.

1. Read the round terms, confirmations, and audit records.
2. Get evidence through the approved support channel.
3. Record the decision and reviewer identity.
4. For a refund, issue it through the provider Dashboard.
5. Wait for the signed refund event and transfer reversal record.
6. For an approved release, restore the round to completed only after both confirmations and legal approval.
7. Record a restricted audit event for the decision.
8. Let an owning account request release with the normal idempotency key.

Never resolve a dispute with an AI score.
Never delete ledger records to make totals match.
If the provider cannot reverse a transfer, keep the case open and record the liability.

## Backups and retention

Use managed daily backups and point-in-time recovery when available.
Test a restore in a separate environment before the paid pilot.
Set retention periods for accounts, applications, audit records, and financial records.
Local law determines financial retention obligations.

Delete expired sessions, auth tokens, and obsolete rate-limit rows with a scheduled maintenance job.
The API refuses expired records even before maintenance removes them.
The initial release does not create a scheduled maintenance service.

## Privacy requests

Verify the requester's identity through the approved support process.
Export only records that belong to that account.
Separate financial records that need legal retention from removable profile data.
Record the request and decision without excess personal information.

## Incident response

1. Set `LIVE_PAYMENTS_ENABLED=false` if money integrity is uncertain.
2. Preserve provider events and database records.
3. Identify the affected rounds and amounts.
4. Reconcile the provider state before any corrective payment.
5. Restore service only after the owner approves the recovery evidence.

A payments pause also stops webhook processing in this release.
After recovery, replay the provider's pending events before you accept new rounds.
