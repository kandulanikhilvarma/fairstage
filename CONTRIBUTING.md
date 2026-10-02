# Contribute

Open an issue with a concrete problem and a reproducible example.
Use fictional data. Do not include candidate or payment details.

1. Create a feature branch.
2. Install dependencies with `npm ci`.
3. Run `npm run check`.
4. Run `npm run test:e2e` after a successful build.
5. Open a pull request with the problem, change, and test results.

Keep the candidate amount separate from the employer fee.
Do not add salary deductions or automated candidate scores.
Every money-state change needs a test for permissions and duplicate requests.

Use a concise Conventional Commit subject.
Use your own author identity. Do not add automated-tool attribution trailers.
