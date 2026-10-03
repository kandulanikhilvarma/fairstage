# Money rules

## Amounts and fees

Each round has one currency and one payment provider.
USD rounds use Stripe.
INR rounds use Razorpay.
The app does not convert currencies.
Compare totals separately for each currency.

The database stores integer minor units.
For USD, 100 units equal $1.
For INR, 100 units equal ₹1.
The legacy `amount_cents` and `fee_cents` fields also store paise for INR rounds.
Round amounts range from 500 to 1,000,000 minor units.

The server computes the Launch fee at 800 basis points, or 8% of candidate pay.
The server rounds positive fees to the nearest minor unit with `Math.round`.
The client cannot override the fee.
Current payment actions use this rate.
The app does not activate Team or Scale subscriptions.

```text
feeMinor = Math.round(candidateMinor * 800 / 10000)
totalMinor = candidateMinor + feeMinor
```

| Item | USD example | INR example |
| --- | --- | --- |
| Candidate pay | $45.00 / 4,500 cents | ₹450.00 / 45,000 paise |
| Platform fee | $3.60 / 360 cents | ₹36.00 / 3,600 paise |
| Employer total | $48.60 / 4,860 cents | ₹486.00 / 48,600 paise |

For 507 minor units of candidate pay, the fee equals 41 minor units.
The total equals 548 minor units.
Provider costs reduce the platform margin rather than the offered candidate amount.

The Launch price has no monthly subscription fee.
Provider charges still apply.
Gateway charges, transfer charges, refunds, disputes, and provider taxes depend on the merchant agreement.
Zero bank MDR for some UPI payments does not establish zero gateway costs. [Razorpay pricing](https://razorpay.com/pricing/).
Stripe Connect also has separate commercial terms. [Stripe Connect pricing](https://stripe.com/connect/pricing).

The checkout does not calculate or collect tax for the interview service or platform fee.
The owner must review tax obligations before a paid launch.
Provider taxes on provider fees do not replace that review.

## Provider approval

Merchant activation and platform approval are separate from software deployment.
Razorpay Route needs approved linked accounts and approval of the proposed interview payment relationship. [Route requirements](https://razorpay.com/docs/payments/route/).
The implemented INR release also needs the provider's Direct Transfer feature. [Direct Transfers](https://razorpay.com/docs/api/payments/route/direct-transfers/).

Stripe India does not now support separate charges and transfers or standalone transfers to connected accounts.
An invitation for an India account does not remove this restriction. [Stripe India marketplace support](https://support.stripe.com/questions/stripe-india-support-for-marketplaces).
Keep the USD action gate disabled for an India platform.
An approved platform in a supported jurisdiction must establish provider acceptance of this funds flow and candidate countries.

Production Stripe actions need these settings:

- `LIVE_PAYMENTS_ENABLED=true`
- A live `STRIPE_SECRET_KEY`
- An uppercase two-letter `STRIPE_PLATFORM_COUNTRY` other than `IN`
- `STRIPE_FUNDS_FLOW_APPROVED=true`

The approval flag records the operator's decision.
The flag does not establish provider approval.
Candidates must use the hosted Stripe account setup for an approved country.
The server checks the provider's transfer capability and payout readiness before collection or release.

## USD flow with Stripe

Stripe charges the employer on the platform account.
The app waits for a paid Checkout event and a captured provider charge.
Both people must confirm completion before release.
The app transfers the candidate amount to the connected account.
The captured charge identifies the transfer's `source_transaction`.
Stripe controls fund availability and later bank settlement. [Separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers).

The platform balance bears Stripe fees, refunds, and chargebacks for this charge model.
A refund does not automatically undo a separate transfer.
A transfer reversal needs enough connected balance or the provider's approved reserve arrangement. [Stripe refund and reversal rules](https://docs.stripe.com/connect/separate-charges-and-transfers).
The owner must keep a reserve for unrecovered amounts and provider costs.

## INR flow with Razorpay

The employer pays through Razorpay Checkout against a server-created INR order.
Available payment methods depend on the approved merchant configuration.
The server verifies the stored order and payment signature.
The server then fetches the provider payment to confirm the captured amount and currency.
A browser success message alone cannot fund a round.

After both completion confirmations, the app requests a Route Direct Transfer.
The destination comes from an approved operator mapping for the candidate.
Candidates cannot submit a linked account ID through their profile.
The server checks that the provider reports the linked account as activated.

Direct Transfers draw from the merchant's available provider balance.
A Direct Transfer does not reserve one employer payment for one candidate.
Gateway fees, Route fees, settlements, or other transfers can reduce that balance. [Route transfers and balance](https://razorpay.com/docs/payments/route/transfer-funds-to-linked-accounts/).
The operator must maintain enough available funds to meet candidate obligations.
Provider fees and taxes can consume more than the retained platform fee. [Route fee examples](https://razorpay.com/docs/payments/route/transfer-fees-example).

The app records candidate pay only after the provider reports a processed transfer.
A pending transfer leaves the round completed.
A failed transfer needs operator review.
The app does not automatically replace a confirmed failed transfer.

## Ledger and failure recovery

The database locks each round during a money action.
Unique provider references prevent duplicate ledger entries.
Separate event tables prevent duplicate Stripe and Razorpay webhook records.
Failed transactions keep no successful event marker, so the provider can retry.

Stripe uses stable keys for account setup, each Checkout generation, and release.
Before release, the server checks prior transfers for the round.
Razorpay uses the round ID as the order receipt and transfer idempotency key.
An uncertain Direct Transfer request must keep the original key and payload. [Razorpay idempotent transfers](https://razorpay.com/docs/api/payments/route/direct-transfers-idempotent-request).
An operator must check provider records before any replacement transfer.

Refund events add only the increase in the cumulative refund amount.
Partial refunds set the round to disputed.
Full refunds set the round to cancelled.
The original candidate amount and earlier ledger entries remain intact.

Stripe refund and lost-dispute events trigger incremental reversals of prior transfers.
The total reversal cannot exceed the candidate transfer amount.
If a reversal fails, the app retains the refund record and requests an event retry.
The `transfer_reversal_pending` audit event identifies the repair need.

Razorpay refund events record the confirmed refund.
After a transfer, the app also creates a `razorpay_reversal_review` audit event.
The app does not issue Razorpay refunds or reversals automatically.
The operator must use the approved provider procedure for those actions.
Signed transfer events then reconcile confirmed reversals.

Manual candidate disputes block release.
The app has no operator adjudication console.
Provider disputes can freeze a round independently of the manual dispute record.
Follow [the operator guide](OPERATIONS.md) before any correction.

## Pause behavior

`LIVE_PAYMENTS_ENABLED=false` stops new Stripe checkout, account setup, and transfer requests.
`RAZORPAY_PAYMENTS_ENABLED=false` stops new Razorpay orders and transfer requests.
`RAZORPAY_ROUTE_ENABLED=false` also stops those Razorpay actions.
An existing hosted checkout can still receive a payment during the pause.
The provider can also complete an earlier pending transfer.

Keep the database available during the pause.
Keep valid provider credentials available during the pause.
Keep endpoint secrets available during the pause.

Signed webhooks continue to reconcile captures, refunds, disputes, and earlier transfers.
Stripe can reverse an earlier transfer to repair a confirmed refund or lost dispute.
Razorpay webhook handlers fetch provider records and update the ledger or review queue.
Razorpay webhook handlers create no new transfer, refund, or reversal request.

Stripe webhook reconciliation does not depend on the new-action jurisdiction or approval gates.
Production reconciliation still rejects test provider credentials.
If the owner removes credentials, the app cannot reconcile events.
Removal of credentials needs a separate incident review.

## Bank settlement and hire decisions

The app's paid status confirms a provider transfer to a candidate account.
The status does not confirm receipt in the candidate's bank account.
The app does not track all later bank payout events.
Use provider settlement reports for bank reconciliation.
The operating company must establish provider acceptance of the funds flow.
The software does not establish a regulated escrow service.

Earned interview pay does not depend on a hire decision.
The app does not deduct interview pay from salary.
The bonus-credit calculator only compares earned interview pay with a separate proposed bonus.
The smaller amount sets the proposed credit.
The salary deduction remains zero.
The calculator does not create a contract or authorize payroll recovery.
