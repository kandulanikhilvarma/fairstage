# Public deployment record

Vercel published Fairstage on 2 October 2026.

| Item | Verified value |
| --- | --- |
| Public app | [fairstage.vercel.app](https://fairstage.vercel.app) |
| Public source | [kandulanikhilvarma/fairstage](https://github.com/kandulanikhilvarma/fairstage) |
| Vercel project | [kandula/fairstage](https://vercel.com/kandula/fairstage) |
| First source commit | `328d3f61e36f593c87559c11bf72491e616c6693` |
| First deployment | `dpl_A9rXVKCex6qCnVdBR7GNojjvmtRP` |
| Runtime mode | Demo |
| Real payments | Disabled |
| Source integration | Connected GitHub repository, production branch `main` |

The deployment used the existing signed-in Vercel connection.
No Vercel MCP tool was available in this session.
Vercel's project view showed **Ready** and the verified source commit.
The public domain matches the app's canonical URL.

## Evidence

- [Merged implementation PR](https://github.com/kandulanikhilvarma/fairstage/pull/1)
- [Implementation CI](https://github.com/kandulanikhilvarma/fairstage/actions/runs/37013809332)
- [Merged-main CI](https://github.com/kandulanikhilvarma/fairstage/actions/runs/37014071806)
- [HTTP checks](deployment-evidence.json)
- [Live home screenshot](screenshots/live-home.png)
- [Live candidate workspace screenshot](screenshots/live-workspace.png)

The HTTP checks cover public pages, workspace routes, config, health, and the sitemap.
The checks also confirm that demo mode refuses registration and Stripe events.
The browser check confirms that the public app loads the expected brand and workspace.
On 3 October, the browser check completed the demo round from both account roles.
The employer and candidate confirmed completion before the simulated $45 release.
The released round and candidate role remained after a page reload.
No real money moved.

## Update and rollback

1. Create a branch from the current main branch.
2. Run the required local checks.
3. Open a pull request.
4. Wait for CI success on that exact commit.
5. Save a backup of the pre-merge main branch.
6. Squash-merge the verified commit.
7. Wait for the connected Vercel deployment to become Ready.
8. Check the health endpoint and the changed app flow on the public domain.

For an incident, use Vercel's rollback control to restore a verified deployment.
A source rollback needs a separate reviewed commit.
Keep provider and database records intact during a payment incident.

## Commercial activation

The public deployment has no live database, email, or Stripe credentials.
The app cannot process real interviews or payments in this mode.
Complete [the launch guide](LAUNCH.md) before the commercial pilot.
