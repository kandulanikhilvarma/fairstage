import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { Pool } from "pg";
import { e2eBaseURL, e2eDatabaseUrl } from "../playwright.config";

const removedCopy =
  /\bdemo\b|fictional data|no money moves|MIT[- ]licensed|MIT license/i;
const publicRoutes = [
  "/",
  "/pricing",
  "/jobs",
  "/account",
  "/how-it-works",
  "/policy",
  "/privacy",
  "/open",
  "/examples",
];
const protectedRoutes = [
  "/workspace",
  "/workspace/interviews",
  "/workspace/jobs",
  "/workspace/wallet",
  "/workspace/preparation",
  "/workspace/settings",
  "/workspace/analytics",
];

async function settle(page: Page, route: string) {
  await page.goto(route);
  if (route.startsWith("/workspace"))
    await expect(
      page.getByRole("heading", { name: "Sign in to your workspace." }),
    ).toBeVisible();
  else if (route.startsWith("/account")) {
    if (e2eDatabaseUrl)
      await expect(page.locator(".auth-form form button")).toBeEnabled();
    else
      await expect(
        page.getByText(
          "Sign-in is temporarily unavailable. Please try again later.",
        ),
      ).toBeVisible();
    if (!e2eDatabaseUrl)
      await expect(page.locator(".auth-form form button")).toBeDisabled();
  }
  await page.evaluate(() => document.fonts.ready);
}

async function browserWorkspace(page: Page) {
  // Chromium sends Secure cookies on its trusted loopback origin. Playwright's
  // API request client applies different HTTP cookie rules, so use the browser.
  return page.evaluate(async () => {
    const response = await fetch("/api/workspace", {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body: unknown = await response.json();
    return { status: response.status, body };
  });
}

test("public navigation and calls to action use production copy", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  for (const route of publicRoutes) {
    await settle(page, route);
    await expect(page.locator("body")).not.toContainText(removedCopy);
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Good interviews.*Fair pay/ }),
  ).toBeVisible();
  await expect(page.locator(".hero-actions .button")).toHaveAttribute(
    "href",
    /\/account/,
  );
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account(?:\?|$)/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Close navigation" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Pricing", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(runtimeErrors).toEqual([]);
});

test("account roles, password controls, and unavailable providers are explicit", async ({
  page,
}) => {
  await settle(page, "/account");
  await expect(
    page.getByRole("button", { name: /I.*candidate/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Google sign-in is currently unavailable/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email link", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page
    .locator(".tabs")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "12",
  );
  await expect(page.getByLabel("Company", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /I.*hiring/ }).click();
  await expect(page.getByLabel("Company", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /I.*hiring/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  if (!e2eDatabaseUrl)
    await expect(page.locator(".auth-form form button")).toBeDisabled();
  await page.goto("/account?authError=google_cancelled");
  await expect(page.locator(".auth-form").getByRole("alert")).toContainText(
    "Google sign-in was cancelled.",
  );
  await page.goto("/account?action=magic&token=invalid");
  await expect(
    page.getByRole("heading", { name: "Confirm your sign-in." }),
  ).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("runtime configuration isolates the browser suite from payment and email providers", async ({
  request,
}) => {
  const response = await request.get("/api/config");
  expect(response.ok()).toBe(true);
  const config = await response.json();
  expect(config).not.toHaveProperty("demo");
  expect(config).toMatchObject({
    accounts: !!e2eDatabaseUrl,
    payments: false,
    google: false,
    magic: false,
    email: false,
    razorpay: false,
    ai: false,
  });
  const health = await request.get("/api/health");
  expect(health.status()).toBe(e2eDatabaseUrl ? 200 : 503);
  expect(await health.json()).toMatchObject({ mode: "production" });
});

test("pricing calculator updates costs and preserves base salary", async ({
  page,
}) => {
  await page.goto("/pricing");
  const budget = page.locator(".calc-result").first();
  await expect(budget.locator(".total")).toContainText("$599.40");
  await page.getByLabel("Plan to estimate").selectOption("1");
  await expect(budget.locator(".total")).toContainText("$661.75");
  const introduction = page.locator("#round-count-0");
  await introduction.focus();
  await introduction.press("Home");
  await expect(introduction).toHaveValue("0");
  await expect(budget.locator(".total")).toContainText("$504.25");
  await page
    .getByLabel("Explore a proposed bonus credit", { exact: false })
    .check();
  await page.getByLabel("Separate signing bonus").fill("100");
  await expect(
    page.locator(".calc-line").filter({ hasText: "Base salary deduction" }),
  ).toContainText("$0");
  await expect(
    page.locator(".calc-line").filter({ hasText: "Proposed bonus credit" }),
  ).toContainText("$100");
});

test("two examples describe reusable interview terms", async ({ page }) => {
  await page.goto("/examples");
  await expect(
    page.getByRole("heading", { name: "A clear introduction", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "A focused skills interview",
      exact: true,
    }),
  ).toBeVisible();
  const approaches = page.getByRole("link", { name: "Use this approach" });
  await expect(approaches).toHaveCount(2);
  for (const approach of await approaches.all())
    await expect(approach).toHaveAttribute("href", "/account?role=employer");
  await expect(page.locator("main")).toContainText(
    "No salary deduction applies.",
  );
  await approaches.first().click();
  await expect(page.getByRole("button", { name: /I.*hiring/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("logged-out workspace routes show a sign-in gate and no private records", async ({
  page,
  request,
}) => {
  for (const route of protectedRoutes) {
    await settle(page, route);
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveAttribute("href", "/account");
    await expect(page.locator(".round-item, .stat, table")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Offer a round|Post a job|Export CSV/ }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(removedCopy);
  }
  const workspace = await request.get("/api/workspace");
  expect(workspace.status()).toBe(e2eDatabaseUrl ? 401 : 503);
  expect(await workspace.json()).not.toHaveProperty("user");
});

test("15 public and protected routes have no serious accessibility defects", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const route of [...publicRoutes, ...protectedRoutes.slice(0, 6)]) {
    await settle(page, route);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact || ""),
      ),
      route,
    ).toEqual([]);
  }
});

test("button labels stay readable and mobile targets remain at least 44px", async ({
  page,
}) => {
  test.setTimeout(120000);
  const capture = process.env.E2E_CAPTURE_SCREENSHOTS === "true";
  if (capture) await mkdir("docs/screenshots", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const route of [
      "/",
      "/account",
      "/examples",
      "/pricing",
      "/workspace",
    ]) {
      await settle(page, route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} ${name}`,
      ).toBe(true);
      const controls = await page
        .locator("button, a.button")
        .evaluateAll((elements) => {
          function rgba(value: string) {
            return (value.match(/[\d.]+/g) || []).map(Number);
          }
          function luminance(rgb: number[]) {
            return rgb
              .slice(0, 3)
              .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          }
          return elements
            .filter((element) => element.getBoundingClientRect().width > 0)
            .map((element) => {
              const style = getComputedStyle(element);
              const bounds = element.getBoundingClientRect();
              const ancestors: Element[] = [];
              for (
                let current: Element | null = element;
                current;
                current = current.parentElement
              )
                ancestors.unshift(current);
              let background = [255, 255, 255];
              for (const ancestor of ancestors) {
                const color = rgba(getComputedStyle(ancestor).backgroundColor);
                const alpha = color[3] ?? 1;
                background = background.map(
                  (v, i) => (color[i] ?? v) * alpha + v * (1 - alpha),
                );
              }
              const foreground = rgba(style.color);
              const a = luminance(foreground);
              const b = luminance(background);
              return {
                label:
                  element.textContent?.trim() ||
                  element.getAttribute("aria-label"),
                height: bounds.height,
                contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              };
            });
        });
      expect(controls.length, `${route} ${name}`).toBeGreaterThan(0);
      for (const control of controls) {
        expect(
          control.contrast,
          `${route} ${name}: ${control.label}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          control.height,
          `${route} ${name}: ${control.label}`,
        ).toBeGreaterThanOrEqual(44);
      }
      if (capture && ["/", "/account"].includes(route))
        await page.screenshot({
          path: `docs/screenshots/production-${route === "/" ? "home" : "account"}-${name}.png`,
          fullPage: false,
          animations: "disabled",
        });
    }
  }
});

test.describe("production workflows with an isolated local PostgreSQL database", () => {
  test.skip(
    !e2eDatabaseUrl,
    "Set E2E_DATABASE_URL to a loopback database named fairstage. CI uses its PostgreSQL service.",
  );
  let database: Pool;
  const createdUserIds = new Set<string>();
  const registeredEmails = new Set<string>();
  const runId = randomUUID();
  const password = "Fairstage-test-password-2026!";
  type Account = {
    id: string;
    name: string;
    email: string;
    role: "candidate" | "employer";
  };
  test.beforeAll(async () => {
    database = new Pool({ connectionString: e2eDatabaseUrl });
    await database.query("SELECT id,headline FROM users LIMIT 0");
  });
  test.afterAll(async () => {
    if (!database) return;
    const registered = registeredEmails.size
      ? await database.query<{ id: string }>(
          "SELECT id FROM users WHERE email=ANY($1::text[])",
          [[...registeredEmails]],
        )
      : { rows: [] };
    for (const user of registered.rows) createdUserIds.add(user.id);
    const ids = [...createdUserIds];
    if (ids.length) {
      const client = await database.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "DELETE FROM disputes WHERE opened_by=ANY($1::uuid[]) OR round_id IN(SELECT id FROM rounds WHERE employer_id=ANY($1::uuid[]) OR candidate_id=ANY($1::uuid[]))",
          [ids],
        );
        await client.query(
          "DELETE FROM ledger WHERE round_id IN(SELECT id FROM rounds WHERE employer_id=ANY($1::uuid[]) OR candidate_id=ANY($1::uuid[]))",
          [ids],
        );
        await client.query(
          "DELETE FROM rounds WHERE employer_id=ANY($1::uuid[]) OR candidate_id=ANY($1::uuid[])",
          [ids],
        );
        await client.query(
          "DELETE FROM applications WHERE candidate_id=ANY($1::uuid[]) OR job_id IN(SELECT id FROM jobs WHERE employer_id=ANY($1::uuid[]))",
          [ids],
        );
        await client.query(
          "DELETE FROM jobs WHERE employer_id=ANY($1::uuid[])",
          [ids],
        );
        await client.query(
          "DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[])",
          [ids],
        );
        await client.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [ids]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    await database.end();
  });
  async function account(role: Account["role"]): Promise<Account> {
    const id = randomUUID();
    const name = `E2E ${role} ${id.slice(0, 8)}`;
    const email = `e2e-${runId}-${id}@example.test`;
    const salt = randomBytes(16).toString("hex");
    const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
    await database.query(
      "INSERT INTO users(id,name,email,password_hash,role,company,country,email_verified) VALUES($1,$2,$3,$4,$5,$6,'US',true)",
      [id, name, email, hash, role, role === "employer" ? "Fairstage E2E" : ""],
    );
    createdUserIds.add(id);
    return { id, name, email, role };
  }
  async function session(
    browser: Browser,
    user: Account,
  ): Promise<{ context: BrowserContext; page: Page }> {
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await database.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [hash, user.id],
    );
    const context = await browser.newContext({ baseURL: e2eBaseURL });
    await context.addCookies([
      {
        name: "fs_session",
        value: token,
        url: e2eBaseURL,
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
    return { context, page: await context.newPage() };
  }
  test("candidates and employers register, sign out, and sign in with real sessions", async ({
    browser,
  }) => {
    test.setTimeout(120000);
    for (const role of ["candidate", "employer"] as const) {
      const context = await browser.newContext({ baseURL: e2eBaseURL });
      const page = await context.newPage();
      const email = `e2e-register-${runId}-${randomUUID()}@example.test`;
      registeredEmails.add(email);
      try {
        await page.goto(`/account?role=${role}`);
        await page
          .locator(".tabs")
          .getByRole("button", { name: "Create account", exact: true })
          .click();
        await page.getByLabel("Your name", { exact: true }).fill(`E2E ${role}`);
        if (role === "employer")
          await page
            .getByLabel("Company", { exact: true })
            .fill("Fairstage E2E");
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
          .locator(".auth-form form")
          .getByRole("button", { name: "Create account", exact: true })
          .click();
        await expect(page).toHaveURL(/\/workspace$/);
        expect(await context.cookies()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: "fs_session",
              httpOnly: true,
              secure: true,
              sameSite: "Lax",
            }),
          ]),
        );
        const response = await browserWorkspace(page);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          user: { email, role, verified: false },
        });
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(page).toHaveURL(/\/account$/);
        expect((await browserWorkspace(page)).status).toBe(401);
        await page.getByLabel("Email address", { exact: true }).fill(email);
        await page
          .getByLabel("Password", { exact: true })
          .fill("This-password-is-not-correct");
        await page
          .locator(".auth-form form")
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(
          page.locator(".auth-form").getByRole("alert"),
        ).toContainText("The email or password is not correct.");
        await page.getByLabel("Password", { exact: true }).fill(password);
        await page
          .locator(".auth-form form")
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await expect(page).toHaveURL(/\/workspace$/);
        const signedIn = await browserWorkspace(page);
        expect(signedIn.status).toBe(200);
        expect(signedIn.body).toMatchObject({ user: { email, role } });
      } finally {
        await context.close();
      }
    }
  });
  test("profile details persist and account exports contain only the signed-in user", async ({
    browser,
  }) => {
    const user = await account("candidate");
    const { context, page } = await session(browser, user);
    try {
      await page.goto("/workspace/settings");
      await page
        .getByLabel("Professional headline")
        .fill("Accessibility engineer");
      await page
        .getByLabel("Skills (comma separated)", { exact: true })
        .fill("TypeScript, Accessibility, PostgreSQL");
      await page
        .getByLabel("Portfolio URL", { exact: true })
        .fill("https://example.test/portfolio");
      await page
        .getByLabel("Resume URL", { exact: true })
        .fill("https://example.test/resume.pdf");
      await page.getByLabel("Time zone", { exact: true }).fill("Asia/Kolkata");
      await page
        .getByLabel("Profile note", { exact: true })
        .fill(
          "I build accessible web products and can discuss one relevant project.",
        );
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .click();
      await expect(page.locator('.notice.success[role="status"]')).toHaveText(
        "Profile saved.",
      );
      await page.reload();
      await expect(page.getByLabel("Professional headline")).toHaveValue(
        "Accessibility engineer",
      );
      await expect(
        page.getByLabel("Skills (comma separated)", { exact: true }),
      ).toHaveValue(/TypeScript.*Accessibility.*PostgreSQL/);
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download account data", exact: true })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.json$/);
      const path = await download.path();
      expect(path).not.toBeNull();
      const exported = JSON.parse(await readFile(path!, "utf8"));
      expect(exported.user).toMatchObject({
        id: user.id,
        email: user.email,
        headline: "Accessibility engineer",
        skills: ["TypeScript", "Accessibility", "PostgreSQL"],
      });
      expect(exported.user).not.toHaveProperty("password_hash");
      expect(exported.rounds).toEqual([]);
      expect(exported.applications).toEqual([]);
    } finally {
      await context.close();
    }
  });
  test("an employer publishes a role, reviews an application, and offers a round a candidate accepts", async ({
    browser,
  }) => {
    test.setTimeout(120000);
    const employer = await account("employer");
    const candidate = await account("candidate");
    const employerSession = await session(browser, employer);
    const candidateSession = await session(browser, candidate);
    const employerPage = employerSession.page;
    const candidatePage = candidateSession.page;
    const title = `Accessibility engineer ${randomUUID().slice(0, 8)}`;
    try {
      await employerPage.goto("/workspace/jobs");
      await employerPage
        .getByRole("button", { name: "Post a job", exact: true })
        .click();
      await employerPage.getByLabel("Role title", { exact: true }).fill(title);
      await employerPage
        .getByLabel("Location and remote policy")
        .fill("Remote · Global");
      await employerPage.getByLabel("Minimum annual salary").fill("90000");
      await employerPage.getByLabel("Maximum annual salary").fill("120000");
      await employerPage
        .getByLabel("Role and interview process")
        .fill(
          "Build accessible interfaces. Each interview has a clear scope, a fixed duration, and stated candidate pay.",
        );
      await employerPage
        .getByRole("button", { name: "Publish role", exact: true })
        .click();
      await expect(
        employerPage.locator('.notice.success[role="status"]'),
      ).toHaveText("Job saved.");
      await candidatePage.goto("/workspace/jobs");
      await candidatePage
        .getByLabel("Search jobs", { exact: true })
        .fill(title);
      const job = candidatePage.locator(".job-row").filter({ hasText: title });
      await job.getByRole("button", { name: "View role", exact: true }).click();
      await job
        .getByLabel("Tell the team why this role interests you")
        .fill(
          "I build accessible web interfaces and would like to discuss a relevant project.",
        );
      await job
        .getByRole("button", { name: "Send application", exact: true })
        .click();
      await expect(
        candidatePage.locator('.notice.success[role="status"]'),
      ).toHaveText(
        "Application saved. You can see it in the candidate workspace.",
      );
      await employerPage.reload();
      await employerPage
        .getByLabel(`Application status for ${candidate.name}`, { exact: true })
        .selectOption("interviewing");
      await employerPage
        .getByRole("button", { name: "Update application", exact: true })
        .click();
      await expect(
        employerPage.locator('.notice.success[role="status"]'),
      ).toHaveText("Application updated.");
      await candidatePage.reload();
      await expect(
        candidatePage.locator(".status").filter({ hasText: "interviewing" }),
      ).toBeVisible();
      await employerPage.goto("/workspace/interviews");
      await employerPage
        .getByRole("button", { name: "Offer a round", exact: true })
        .click();
      await employerPage
        .getByLabel("Candidate email", { exact: true })
        .fill(candidate.email);
      await employerPage.getByLabel("Role title", { exact: true }).fill(title);
      await employerPage
        .getByLabel("Payment currency", { exact: true })
        .selectOption("USD");
      await employerPage
        .getByLabel("Meeting link", { exact: true })
        .fill("https://example.test/interview");
      const nextDay = new Date(Date.now() + 86400000);
      const localDate = new Date(
        nextDay.getTime() - nextDay.getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16);
      await employerPage
        .getByLabel("Date and time", { exact: false })
        .fill(localDate);
      await employerPage
        .getByRole("button", { name: "Send round offer", exact: true })
        .click();
      await expect(
        employerPage.locator(".round-item").filter({ hasText: title }),
      ).toBeVisible();
      await candidatePage.goto("/workspace/interviews");
      const round = candidatePage
        .locator(".round-item")
        .filter({ hasText: title });
      await round.getByRole("button", { name: "Details", exact: true }).click();
      await round
        .getByRole("button", { name: "Accept terms", exact: true })
        .click();
      await expect(round.locator(".status")).toHaveText("accepted");
      await candidatePage.reload();
      await round.getByRole("button", { name: "Details", exact: true }).click();
      await expect(round.locator(".status")).toHaveText("accepted");
      const calendarPromise = candidatePage.waitForEvent("download");
      await round
        .getByRole("link", { name: "Add to calendar", exact: true })
        .click();
      const calendar = await calendarPromise;
      expect(calendar.suggestedFilename()).toBe("interview.ics");
      const calendarPath = await calendar.path();
      const calendarText = await readFile(calendarPath!, "utf8");
      expect(calendarText).toContain("BEGIN:VCALENDAR");
      expect(calendarText).toContain(title);
      expect(calendarText).toContain("DTSTART:");
      expect(calendarText).toContain("DTEND:");
      await candidatePage.goto("/workspace/wallet");
      await expect(
        candidatePage.getByRole("button", { name: "Export CSV", exact: true }),
      ).toBeDisabled();
      await expect(
        candidatePage.getByText("No payment events yet.", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await database.query(
            "SELECT status FROM rounds WHERE employer_id=$1 AND candidate_id=$2",
            [employer.id, candidate.id],
          )
        ).rows[0].status,
      ).toBe("accepted");
      expect(
        (
          await database.query(
            "SELECT count(*)::int AS count FROM ledger l JOIN rounds r ON r.id=l.round_id WHERE r.employer_id=$1",
            [employer.id],
          )
        ).rows[0].count,
      ).toBe(0);
    } finally {
      await employerSession.context.close();
      await candidateSession.context.close();
    }
  });
  test("wallet CSV exports all owned USD and INR events and excludes another account's ledger", async ({
    browser,
  }) => {
    const employer = await account("employer");
    const candidate = await account("candidate");
    const foreignEmployer = await account("employer");
    const foreignCandidate = await account("candidate");
    const usdRound = randomUUID();
    const inrRound = randomUUID();
    const foreignRound = randomUUID();
    const records = [
      {
        id: usdRound,
        employerId: employer.id,
        candidateId: candidate.id,
        currency: "USD",
        amountCents: 4567,
        feeCents: 365,
        type: "paid",
        ledgerCents: 4567,
        createdAt: "2026-10-01T09:00:00.000Z",
      },
      {
        id: inrRound,
        employerId: employer.id,
        candidateId: candidate.id,
        currency: "INR",
        amountCents: 123456,
        feeCents: 9876,
        type: "funded",
        ledgerCents: 133332,
        createdAt: "2026-10-02T10:30:00.000Z",
      },
      {
        id: foreignRound,
        employerId: foreignEmployer.id,
        candidateId: foreignCandidate.id,
        currency: "USD",
        amountCents: 765432,
        feeCents: 61235,
        type: "funded",
        ledgerCents: 826667,
        createdAt: "2026-10-03T11:00:00.000Z",
      },
    ];
    // These records exist only in the explicitly isolated test database.
    // No provider endpoint or production payment state creates these fixtures.
    for (const record of records) {
      await database.query(
        "INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms,status,currency,payment_provider) VALUES($1,$2,$3,'CSV export test fixture','Introduction',30,$4,$5,now()-interval '1 day','https://example.test/interview','Test-only ledger records for CSV export verification.',$6,$7,$8)",
        [
          record.id,
          record.employerId,
          record.candidateId,
          record.amountCents,
          record.feeCents,
          record.type,
          record.currency,
          record.currency === "INR" ? "razorpay" : "stripe",
        ],
      );
      await database.query(
        "INSERT INTO ledger(id,round_id,type,amount_cents,provider_ref,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          record.id,
          record.type,
          record.ledgerCents,
          `e2e-csv-${runId}-${record.id}`,
          record.createdAt,
        ],
      );
    }
    const history = Array.from({ length: 200 }, (_, index) => ({
      id: randomUUID(),
      createdAt: new Date(
        Date.parse("2026-09-01T00:00:00.000Z") + index * 1000,
      ).toISOString(),
      providerRef: `e2e-csv-${runId}-history-${index}`,
    }));
    await database.query(
      "INSERT INTO ledger(id,round_id,type,amount_cents,provider_ref,created_at) SELECT id,$1,'refunded',1,provider_ref,created_at FROM unnest($2::uuid[],$3::text[],$4::timestamptz[]) AS fixture(id,provider_ref,created_at)",
      [
        usdRound,
        history.map((event) => event.id),
        history.map((event) => event.providerRef),
        history.map((event) => event.createdAt),
      ],
    );
    const { context, page } = await session(browser, candidate);
    try {
      await page.goto("/workspace/wallet");
      const exportButton = page.getByRole("button", {
        name: "Export CSV",
        exact: true,
      });
      await expect(exportButton).toBeEnabled();
      await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(
        200,
      );
      const workspace = await browserWorkspace(page);
      expect(workspace.status).toBe(200);
      expect(workspace.body).toHaveProperty(
        "ledger",
        expect.arrayContaining([
          expect.objectContaining({
            roundId: inrRound,
            amountCents: 133332,
            currency: "INR",
          }),
          expect.objectContaining({
            roundId: usdRound,
            amountCents: 4567,
            currency: "USD",
          }),
        ]),
      );
      const exported = await context.request.get("/api/ledger/export");
      expect(exported.status()).toBe(200);
      expect(exported.headers()["content-type"]).toContain("text/csv");
      expect(exported.headers()["content-disposition"]).toContain(
        "fairstage-payment-records.csv",
      );
      const serverCsv = await exported.text();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10000 }),
        exportButton.click(),
      ]);
      expect(download.suggestedFilename()).toBe(
        "fairstage-payment-records.csv",
      );
      const path = await download.path();
      expect(path).not.toBeNull();
      const csv = await readFile(path!, "utf8");
      expect(csv).toBe(serverCsv);
      expect(csv.trimEnd().split("\r\n")).toEqual([
        '"Date","Event","Round ID","Amount","Currency"',
        ...history.map(
          (event) =>
            `"${event.createdAt}","refunded","${usdRound}","0.01","USD"`,
        ),
        `"2026-10-01T09:00:00.000Z","paid","${usdRound}","45.67","USD"`,
        `"2026-10-02T10:30:00.000Z","funded","${inrRound}","1333.32","INR"`,
      ]);
      expect(csv).not.toContain(foreignRound);
    } finally {
      await context.close();
    }
  });
  test("tenant boundaries and candidate permissions reject access to another account's records", async ({
    browser,
  }) => {
    const employer = await account("employer");
    const candidate = await account("candidate");
    const outsider = await account("candidate");
    const roundId = randomUUID();
    await database.query(
      "INSERT INTO rounds(id,employer_id,candidate_id,title,kind,minutes,amount_cents,fee_cents,scheduled_at,meeting_url,terms) VALUES($1,$2,$3,'Tenant boundary interview','Introduction',30,1500,120,now()+interval '1 day','https://example.test/interview','Discuss one project within the agreed duration.')",
      [roundId, employer.id, candidate.id],
    );
    const ownerSession = await session(browser, candidate);
    const outsiderSession = await session(browser, outsider);
    try {
      await outsiderSession.page.goto("/workspace/interviews");
      await expect(
        outsiderSession.page.getByRole("heading", {
          name: "No rounds in this view.",
        }),
      ).toBeVisible();
      expect(
        (
          await outsiderSession.context.request.get(
            `/api/rounds/${roundId}/calendar`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await outsiderSession.context.request.post(
            `/api/rounds/${roundId}/accept`,
            { headers: { Origin: e2eBaseURL }, data: {} },
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await outsiderSession.context.request.post("/api/jobs", {
            headers: { Origin: e2eBaseURL },
            data: {},
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await ownerSession.context.request.post("/api/profile", {
            headers: { Origin: "https://untrusted.example" },
            data: {},
          })
        ).status(),
      ).toBe(403);
      const exported = await (
        await outsiderSession.context.request.get("/api/account/export")
      ).json();
      expect(exported.user.id).toBe(outsider.id);
      expect(exported.rounds).toEqual([]);
      expect(exported.applications).toEqual([]);
      expect(
        (
          await ownerSession.context.request.get(
            `/api/rounds/${roundId}/calendar`,
          )
        ).status(),
      ).toBe(200);
    } finally {
      await ownerSession.context.close();
      await outsiderSession.context.close();
    }
  });
});
