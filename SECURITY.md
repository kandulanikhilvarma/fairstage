# Security policy

Report security issues through a private GitHub vulnerability report.
If private reports are unavailable, contact kandulanikhilvarma@gmail.com.
Do not post credentials, payment data, or candidate records in a public issue.

## Supported release

The current main branch receives security fixes.
The public deployment uses demo mode until the owner completes the launch checks.

## Security boundaries

The server checks account roles and resource ownership for each protected action.
Sessions use random tokens. The database stores token hashes.
All money writes use database transactions and row locks.
Stripe events need a valid signature over the raw body.
Provider idempotency keys and unique ledger references prevent duplicate release records.

The Content Security Policy permits inline scripts for Next.js hydration.
The policy does not use a nonce. This defense has a documented limit.
The app renders user and model text as escaped React text.

## Before real payments

Complete the checks in docs/LAUNCH.md.
Test the Stripe integration in the owner's test account.
Keep live payments disabled until the owner approves the operating policy and country support.
