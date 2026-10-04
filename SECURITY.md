# Security policy

Report security issues through a private GitHub vulnerability report.
If private reports are unavailable, contact kandulanikhilvarma@gmail.com.
Do not post credentials, payment data, or candidate records in a public issue.

## Supported release

The current main branch receives security fixes.
Account access needs a configured PostgreSQL database.
Live payments need approved merchant credentials and candidate accounts.

## Security boundaries

The server checks account roles and resource ownership for each protected action.
Sessions use random tokens. The database stores token hashes.

All money writes use database transactions and row locks.
Stripe and Razorpay events need a valid signature over the raw body.
Google sign-in checks PKCE, state, nonce, and signed identity claims.
Email sign-in links expire after 15 minutes and work once in the requesting browser.
Provider idempotency keys and unique ledger references prevent duplicate release records.

An unverified password registration does not prove account ownership.
The first verified claim revokes its credentials, sessions, and recovery tokens.
An email advisory lock serializes claims, registration, password login, and profile changes.
The database inserts each session before that transaction commits.

The Content Security Policy permits inline scripts for Next.js hydration.
The policy does not use a nonce. The inline-script allowance limits the policy's protection.
The app renders user and model text as escaped React text.

## Before real payments

Complete the checks in docs/LAUNCH.md.
Test each provider integration in the owner's separate test environment.
Keep live payments disabled until the owner approves the operating policy and country support.
