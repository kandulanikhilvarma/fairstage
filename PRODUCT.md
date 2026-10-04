# Fairstage

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

The user approved Next.js, TypeScript, PostgreSQL, and Stripe Connect.
INR payments use Razorpay Checkout and approved Route accounts.
Vercel is the deployment target.

## Users

Employers pay candidates for interview rounds.
Candidates include students and people with work experience.
Recruiters set the round terms before an interview.
Candidates review the terms before they accept a round.

## Product purpose

Make interview time a paid commitment.
Show the amount, duration, and payment state for each round.
Keep interview pay independent of the hire decision.

## Operating context

The user chose a global market and USD pilot prices.
The operating company is in India. The workspace also supports INR prices.
Each country needs a separate payment and legal review before live service.
Global scope does not imply payment support in every country.

## Capabilities and constraints

The user requested a complete app, public GitHub repository, evaluation, and Vercel deployment.
The user requested visible product rules and an optional open-weight AI assistant.
The current release has no general reuse license, as the user specified.
The AI assistant helps with preparation and questions. A person makes each hire decision.

The original idea includes recovery from the first salary after a hire.
The product records this idea. Payroll recovery needs a separate review and implementation.
An optional credit against a separate employer-funded bonus is a proposal, subject to local review.
The owner has supplied no commercial account, payment credentials, or database credentials.

The public deployment uses real account APIs.
Missing services return an unavailable state. The app must never fabricate an account or payment.

## Brand commitments

The user requested STE-100 and Humanizer for prose.
Use simple technical text and natural brand copy.
Fairstage is a proposed name. The name has no trademark clearance yet.

## Evidence on hand

No customer, testimonial, usage metric, or paid transaction exists.
Examples describe interview templates. They do not create people, jobs, or payments.
The product plan proposes pilot prices for rounds and plans.

## Product principles

- Show the pay before the candidate commits time.
- Charge the employer. Do not charge the candidate.
- Keep money states auditable.
- Give the candidate a dispute path.
- Do not use AI to rank or reject a candidate.

## Open decisions

The owner must confirm supported payment countries and provider approval for the India company.
The owner must approve commercial prices before a paid launch.
The owner must supply live service accounts before real transactions.
