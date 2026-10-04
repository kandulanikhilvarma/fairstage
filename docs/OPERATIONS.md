# Operator guide

## Health and alerts

Check `/api/health` for application and database availability.
The endpoint returns 503 if the app cannot reach a configured database.
Check `/api/config` for the configured action gates.
The health and config endpoints do not establish merchant approval or successful bank settlement.

Set the external alerts for health failures and response time.
Set the alerts for failed Stripe and Razorpay webhook responses.
Set the alerts for database pool errors.
The application does not create an external monitor or alert service.

The API logs generic request IDs.
Stripe webhook failures include the event ID and event type.
Razorpay webhook failures include the event ID.
Keep passwords, payment credentials, bank data, and complete request bodies out of logs.

## Merchant activation and candidate mappings

Keep payment action gates disabled until provider acceptance passes.
Approve the operating company, payer relationship, candidate countries, reserve, and dispute procedure first.
Complete the checks in [the launch guide](LAUNCH.md).

For Stripe, confirm that the platform jurisdiction supports separate charges and transfers.
Stripe India now excludes this charge model. [Stripe India marketplace support](https://support.stripe.com/questions/stripe-india-support-for-marketplaces).
Record the actual jurisdiction in `STRIPE_PLATFORM_COUNTRY`.
Set `STRIPE_FUNDS_FLOW_APPROVED=true` only after approval of the flow and candidate countries.
Set `STRIPE_CONNECT_COUNTRIES` to the approved candidate countries.
Candidates use the hosted provider account setup.
Do not replace a candidate's `connect_id` through a public form.

Razorpay requires merchant activation, Route approval, and Direct Transfer activation for this implementation. [Direct Transfer activation](https://razorpay.com/docs/api/payments/route/direct-transfers/).
A gateway account alone does not authorize Route transfers.
The app has no self-service form that creates a Route linked account.
Use the approved provider process for identity checks and bank verification. [Linked accounts](https://razorpay.com/docs/payments/route/linked-account).

Use this restricted procedure for each Razorpay mapping:

1. Confirm the candidate's verified Fairstage identity and India country.
2. Complete the provider's linked account checks through the approved provider process.
3. Check that the linked account belongs to that candidate.
4. Confirm the provider reports the account as activated.
5. Record the provider account ID and approval evidence in the restricted case record.
6. Lock the candidate row with a restricted database transaction.
7. Set `razorpay_account_id` to the approved provider ID.
8. Set `razorpay_ready=true` only after those checks pass.
9. Record the operator identity and decision in the audit record.
10. Commit the transaction.
11. Confirm the mapping and provider status before the first employer order.

Use parameterized queries for the transaction.
Reject a mapping to a different candidate or an unverified account.
Do not store details of bank accounts or identity documents in Fairstage profile fields.
Do not change an existing destination while a transfer has an uncertain state.
A provider account ID from a candidate message alone does not establish account ownership.

## Daily reconciliation

Reconcile USD and INR separately.
The legacy amount fields use cents for USD and paise for INR.
The server computes the employer fee as `Math.round(candidateMinor * 800 / 10000)`.
The employer total equals candidate pay plus that fee.
See [the money rules](MONEY.md) for fee examples and provider costs.

1. Compare funded ledger entries with captured provider payments.
2. Compare each payment's amount and currency with its round.
3. Compare paid ledger entries with confirmed provider transfers.
4. Compare refunded entries with cumulative provider refunds.
5. Compare reversed entries with cumulative provider reversals.
6. Review manual disputes and provider disputes separately.
7. Review failed or pending events in each provider Dashboard.
8. Review the repair queues below.
9. Record unresolved liabilities in the restricted finance record.

The ledger is an application record, not a complete accounting system.
Provider fees, taxes on those fees, reserves, and bank payouts need separate accounting records.
The checkout does not collect tax for the platform fee or interview service.
The app does not calculate salary deductions.

Keep enough available Razorpay balance for candidate obligations and provider charges.
A captured employer payment does not reserve funds for the later Direct Transfer.
Settlements to the merchant bank can reduce the available provider balance. [Route transfers](https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts/).
Confirm balance availability before any corrective transfer.

The app records paid status for a transfer to a candidate provider account.
The app does not confirm final bank receipt.
Use provider settlement reports for bank reconciliation.
Record settlement failures through the restricted support process.

## Repair queues

The audit table identifies review needs.
The table has no automated case closure field.
Record the resolution through the restricted case record and a new audit event.
Keep the original event and ledger records.

| Audit action | Required review |
| --- | --- |
| `transfer_reversal_pending` | Check the Stripe refund or lost dispute, connected balance, reversal total, and failed event. |
| `razorpay_reversal_review` | Check the refund and prior transfer. Decide the approved provider reversal action. |
| `razorpay_payment_review` | Check the payment dispute or failure. Keep release blocked until a documented decision. |
| `razorpay_transfer_failed` | Check the provider transfer status, destination, feature approval, and available merchant balance. |
| `checkout_payment_failed` | Check the Stripe payment state before a new Checkout generation. |

Use this query through restricted database access to list review events:

```sql
SELECT id, action, resource_id, actor_id, created_at
FROM audit_events
WHERE action IN (
  'transfer_reversal_pending',
  'razorpay_reversal_review',
  'razorpay_payment_review',
  'razorpay_transfer_failed',
  'checkout_payment_failed'
)
ORDER BY created_at;
```

For a Stripe reversal failure, resolve the provider balance or reserve issue first.
Replay the original provider event through the provider's supported mechanism.
The handler keeps the refund record and retries only the unreversed amount.
The action pause does not stop this reversal repair.

For an uncertain Razorpay transfer response, inspect the provider state before any new request.
Preserve the original round ID as `X-Transfer-Idempotency`.
Preserve the original request payload with the approved destination. [Idempotent Direct Transfers](https://razorpay.com/docs/api/payments/route/direct-transfers-idempotent-request).
An owning account can retry the same round after the action gate permits it.
A signed transfer event can also restore the confirmed provider result.

A confirmed failed Razorpay transfer needs a separate operator decision.
The app retrieves a prior transfer ID.
The app does not automatically create a replacement transfer.
Do not clear the stored transfer ID or change the idempotency key to force another payment.
Use an approved, audited repair procedure after verification of the provider outcome.

## Manual dispute review

The release has no operator adjudication console or automatic dispute decision.
Use restricted database access and the approved provider Dashboard.
An open manual dispute blocks release even after a provider dispute ends in the platform's favor.
Razorpay provider dispute events remain in review until an operator resolves the case.

1. Read the accepted terms, completion confirmations, and audit records.
2. Get evidence through the approved support channel.
3. Check the current provider payment, refund, dispute, and transfer records.
4. Record the decision and reviewer identity.
5. If the decision needs a refund, issue it through the approved provider procedure.
6. Confirm the signed refund event updates the ledger.
7. Check the required transfer recovery separately.
8. If the decision permits release, close the manual dispute through an audited restricted transaction.
9. Restore completed status only after both confirmations and verification of the provider payment.
10. Let the owner of the round ask for release through the normal action.
11. Confirm the provider result and ledger entry.

The app does not issue customer refunds through a public API.
Stripe refund events can trigger reversals of earlier candidate transfers.
Razorpay refunds after a transfer create a review event.
The operator must handle the reversal separately.

Never resolve a dispute with an AI score.
Never delete ledger records to make totals match.
If recovery fails, keep the case open.
Record the remaining liability.

## Pause and incident response

An action pause does not stop a prior hosted checkout or a provider request already in progress.
Preserve valid keys and webhook secrets so signed events can still reconcile those outcomes.
If the owner removes credentials, the app cannot reconcile events.
Removal of credentials needs a separate incident review.

1. Set `LIVE_PAYMENTS_ENABLED=false` to stop new Stripe actions.
2. Set `RAZORPAY_PAYMENTS_ENABLED=false` to stop new Razorpay actions.
3. Set `RAZORPAY_ROUTE_ENABLED=false` if Route approval or transfer access is uncertain.
4. Deploy the changed environment settings.
5. Confirm `/api/config` shows the affected action gates as disabled.
6. Preserve provider events and database records.
7. Find the affected rounds and amounts.
8. Reconcile authentic provider records before any corrective payment.
9. Resolve the repair queues.
10. Replay missing events through the provider's supported mechanism.
11. Record the recovery evidence and owner decision.
12. Restore action gates only after provider approval and the required checks pass.

Configured, signed webhooks continue to process captures, refunds, disputes, and prior transfers during a pause.
Stripe can reverse an earlier transfer to repair a confirmed refund or lost dispute.
Razorpay webhook handlers make provider GET requests and update financial records or review events.
Razorpay webhook handlers create no new transfer, refund, or reversal request.
Production webhook handlers still reject test credentials.
Stripe reconciliation does not depend on the jurisdiction or funds-flow action gates.

## Backups, retention, and privacy

Use managed daily backups and point-in-time recovery when available.
Test a restore in a separate environment before a paid launch.
Set the retention periods for accounts, applications, audit records, and financial records.
The owner must review financial retention obligations for the operating company.

Delete expired sessions, auth tokens, and obsolete rate-limit rows through a scheduled maintenance job.
The API refuses expired records before maintenance removes them.
The application does not create that scheduled maintenance service.

Check a privacy request through the approved support process.
Use the account export for authorized workspace records.
Keep records that need legal retention separate from removable profile data.
Record the request and decision without excess personal information.
