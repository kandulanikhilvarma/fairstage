# Money rules

## Amounts

All app amounts use integer USD cents.
The server computes the fee. The client cannot supply an authoritative fee.
The Launch fee equals 8% of candidate pay, rounded to the nearest cent.

For a $45 round:

| Item | Amount |
| --- | --- |
| Candidate pay | $45.00 |
| Employer platform fee | $3.60 |
| Employer checkout total | $48.60 |

Payment processing reduces the platform margin.
Applicable tax needs a separate business and tax review before a paid launch.
The current checkout does not calculate or collect tax.

## Provider flow

The app uses separate charges and transfers.
Stripe charges the employer on the platform account.
After both people confirm completion, the app transfers the candidate amount to the connected account.
The transfer uses the captured charge as its source transaction.
The provider controls available balance and bank settlement timing.

The payment flow does not establish a regulated escrow service.
The operating company must agree on the funds flow with its payment provider.
The platform can bear disputes, refunds, provider fees, and negative balances.

## Idempotency and failure recovery

A stable key identifies each account setup, checkout generation, and release.
The database locks each round during a money action.
The ledger rejects duplicate provider references.
The event table rejects duplicate webhook IDs.
Failed webhook transactions roll back their event record so Stripe can retry.

The webhook checks currency, exact amount, checkout ID, and captured payment state.
Partial refunds create incremental ledger entries.
Later refund events do not add the same amount twice.
Refunds after a transfer request an incremental transfer reversal.
A failed reversal causes an event retry and needs operator review.

## Candidate protections

- Show the exact amount, scope, and duration before acceptance.
- Require candidate acceptance before checkout.
- Require a verified email and ready Connect account before funds movement.
- Require both completion confirmations before release.
- Block release during a dispute.
- Keep pay independent of the hire decision.

## Recovery after a hire

Salary recovery was part of the original idea.
The current app does not implement it.
Consent alone does not establish a lawful wage deduction.

The U.S. Department of Labor restricts deductions that reduce protected minimum wage or overtime pay.
Other federal, state, and national rules can impose further limits.
Read the [wage deduction fact sheet](https://www.dol.gov/agencies/whd/fact-sheets/16-flsa-wage-deductions).

The app can illustrate a proposed credit against a separate signing bonus.
The example caps the credit at the smaller of earned interview pay and the separate bonus.
The salary deduction remains zero.
No bonus proposal becomes a live contract through this calculator.

## Primary references

- [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature)
- [U.S. wage deductions](https://www.dol.gov/agencies/whd/fact-sheets/16-flsa-wage-deductions)
