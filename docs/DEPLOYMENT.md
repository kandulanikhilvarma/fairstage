# Production deployment record

The production app uses a connected GitHub repository and Vercel project.
The application release reached production on 4 October 2026.
The public checks confirmed version 1.1.0 and the production runtime.
Accounts and payment services remain unavailable until the owner completes the activation requirements.

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

| Evidence | Observed result |
| --- | --- |
| Application source | `d9f477ee13b80a0ad57ccc29246a847f7cc9af0a` |
| Verified PR head | `15b2ccfb31999d726fd21044939cfe07c8317da1` |
| Release PR | [Merged PR #11](https://github.com/kandulanikhilvarma/fairstage/pull/11) |
| Release CI | [Successful run](https://github.com/kandulanikhilvarma/fairstage/actions/runs/37194633779) |
| Vercel production result | [Completed deployment](https://vercel.com/kandula/fairstage/3CYhHT3kz3ubeH1VX81DbEcshwBw) |
| GitHub deployment | `6839699634`; Production; successful source mapping |
| Deployment URL | [fairstage-g0gp76tcb-kandula.vercel.app](https://fairstage-g0gp76tcb-kandula.vercel.app) |
| Public check time | `2026-10-04T10:17:24.589Z` |
| Public pages | 16 paths returned HTTP 200 |
| Health | HTTP 503; `status: unavailable`, `mode: production`, `version: 1.1.0` |
| Configuration | All service flags false; default currency INR |
| Rejection checks | Empty registration and unsigned provider webhooks returned 503 |
| Pre-merge backup | `backup/pre-production-202610041015` at `1b02527a805544a0989fd1bddf80448f6de7b30c` |

GitHub's connected Vercel integration reported a completed deployment for the application source above.
The Vercel MCP connection returned HTTP 403 for this project's team scope.
The verification used the GitHub deployment record and direct public HTTP checks.

The public workspace and account page showed service-unavailable notices with visible controls.
The public app contained no sample workspace records or demo banners.
The account and payment flows passed in CI.
The flows did not run against live providers.
Current local screenshots cover desktop and mobile controls in [the screenshot folder](screenshots).

The [machine-readable record](deployment-evidence.json) describes this application release before the later documentation commit.
Use [the release evaluation](EVALUATION.md) for test counts and scope.
Keep credentials, authentication tokens, and personal records out of public evidence.

## Pending activation

- Create and migrate the managed PostgreSQL database.
- Configure the exact production app origin and database connection.
- Configure Google OAuth or a verified email sender for low-friction sign-in.
- Activate the Razorpay merchant and approved Route transfers.
- Check candidate linked accounts through the operator.
- Select commercial hosting before a paid launch.
- Complete provider acceptance and database backup checks.

USD transfers remain disabled for the India operator under the current funds flow.
No live money action or paid hosting upgrade formed part of this verification.

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
