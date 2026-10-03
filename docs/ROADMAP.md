# Roadmap

The current release includes real accounts, paid-round records, profiles, and application management.
Provider service activation remains separate from feature delivery.

## Current release

- Google, email-link, and password sign-in.
- Candidate profiles with skills, work links, and time zones.
- Employer applicant search and manual application states.
- Candidate application withdrawal.
- Interview terms, calendar downloads, and private notes.
- INR Razorpay Route and USD Stripe Connect integrations.
- Currency-aware payment CSV and authorized account export.
- Two interview templates and local preparation.
- Signed provider events and audited account actions.

## Next releases

| Stage | Feature | Acceptance gate |
| --- | --- | --- |
| Pilot | Operator console | Restricted access and audited approval decisions |
| Pilot | Route onboarding workflow | Provider approval, identity checks, and restricted account mapping |
| Pilot | Tax invoices | Approved tax model and operator registration |
| Pilot | Email status alerts | Sender approval, user preferences, and delivery recovery |
| Team | Team seats | Tenant membership tests and controlled invitations |
| Team | Subscriptions | Fee entitlements, cancellation, tax, and billing event checks |
| Team | Calendar sync | Provider consent, scope limits, and time zone checks |
| Team | ATS sync | Provider mapping and deletion controls |
| Scale | Pagination | Cursor stability, query limits, and load tests |
| Scale | Large exports | Data-access review and resource limits |
| Scale | SSO | Identity-provider approval and tenant isolation |
| Scale | More currencies | Provider approval and local pay policy |

The release already includes calendar files and account exports.
Calendar sync and high-volume exports need separate acceptance.
The release does not promise automatic dispute decisions.

## Product experiments

Measure round acceptance, completion, time to transfer, and disputes.
Ask candidates whether the scope and pay meet their expectations.
Compare employer budgets with completion and candidate feedback.
Test higher rates for specialist work and preparation time.
Do not lower an agreed amount after acceptance.

## Salary recovery

The release excludes salary recovery and hidden repayment obligations.
A future change needs a separate legal and product review.
The bonus calculator remains a proposal until the owner approves a lawful contract and implementation.
