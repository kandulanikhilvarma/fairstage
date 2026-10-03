# Production deployment record

The production app uses a connected GitHub repository and Vercel project.
The current release needs a fresh source and public-domain verification.
Older deployment evidence does not establish the behavior of this release.

| Item | Target |
| --- | --- |
| Public app | [fairstage.vercel.app](https://fairstage.vercel.app) |
| Source repository | [kandulanikhilvarma/fairstage](https://github.com/kandulanikhilvarma/fairstage) |
| Vercel project | [kandula/fairstage](https://vercel.com/kandula/fairstage) |
| Production branch | `main` |
| Runtime | Next.js on Node.js 22 with PostgreSQL |
| Account records | Server sessions and database records |
| Payment approval | Separate merchant and provider gates |

## Current-release verification

Record the following evidence after the deployment reaches Ready:

- Exact merged source commit.
- Vercel deployment identifier and source commit.
- Successful CI result for the verified source.
- Public health result and configuration flags.
- Account service readiness with the migrated database.
- Screenshot evidence for visible controls and responsive layouts.
- Candidate and employer flow checks.
- Pending Google, email, payment, and model activation gates.

Use [the release evaluation](EVALUATION.md) for the final check results.
Update the machine-readable deployment record with the same source commit.
Keep credentials, authentication tokens, and personal records out of public evidence.

## Environment boundaries

Production uses the exact `APP_URL` origin.
Google and email sign-in have separate service credentials.
Razorpay and Stripe remain unavailable until their explicit gates and credentials meet the required checks.
Unavailable services do not create completed payment records.

Preview deployments need an isolated database and suitable credentials.
A public source repository does not imply public database access.
Store all server credentials through secure deployment controls.

## Update procedure

1. Create a branch from the current main branch.
2. Run the required local checks.
3. Open a pull request.
4. Wait for successful CI on the exact head commit.
5. Save a backup of the pre-merge main branch.
6. Squash-merge the verified commit.
7. Wait for the connected Vercel deployment to reach Ready.
8. Confirm the source commit.
9. Check the health and configuration on the public domain.
10. Check each changed user flow.
11. Update the evidence record.

## Rollback and incidents

Keep database and provider records intact during a payment incident.
Use Vercel rollback to restore a verified deployment when the schema remains compatible.
Use a separate reviewed commit for a source rollback.
Do not assume an older application can read a newer schema.
Follow [the operator guide](OPERATIONS.md) for payment reconciliation and database recovery.

## Commercial acceptance

A deployed application and an approved merchant account are separate results.
Use [the launch guide](LAUNCH.md) to check credentials, countries, provider acceptance, and support procedures.
Record any remaining activation gate in the final deployment evidence.
