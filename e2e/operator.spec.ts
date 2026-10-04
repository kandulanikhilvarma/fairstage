import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eDatabaseUrl } from "../playwright.config";

// These fixtures test the console UI. They do not grant server access or call a provider.
const firstCase = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "dispute",
  roundId: "22222222-2222-4222-8222-222222222222",
  title: "Frontend skills interview",
  source: "participant_dispute",
  roundStatus: "disputed",
  paymentProvider: "razorpay",
  amountCents: 300000,
  currency: "INR",
  createdAt: "2026-10-04T08:00:00.000Z",
  status: "open",
  decision: "pending",
  ownerId: null,
  version: 0,
  reason:
    "The agreed interview time changed. Please review the schedule record.",
};
const secondCase = {
  ...firstCase,
  id: "33333333-3333-4333-8333-333333333333",
  kind: "repair",
  title: "Backend systems interview",
  source: "razorpay_transfer_failed",
};
const auditNote = {
  id: "44444444-4444-4444-8444-444444444444",
  actorId: "55555555-5555-4555-8555-555555555555",
  actorName: "Approved operator",
  note: "Checked the schedule record. Await the provider response.",
  status: "waiting_provider",
  decision: "provider_review",
  createdAt: "2026-10-04T09:00:00.000Z",
};
const overview = {
  counts: {
    openDisputes: 7,
    disputedRounds: 8,
    repairSignals: 3,
    unreviewedCases: 4,
    waitingProviderCases: 2,
  },
  providerEvents: {
    stripeLastAt: null,
    razorpayLastAt: "2026-10-04T09:00:00.000Z",
  },
  financialActionsEnabled: false,
};
const session = {
  operator: {
    id: auditNote.actorId,
    name: "Approved operator",
    email: "operator@example.test",
  },
  financialActionsEnabled: false,
};
type Handler = (route: Route, url: URL) => Promise<void>;

async function mockConsole(page: Page, handler: Handler) {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        accounts: false,
        payments: false,
        ai: false,
        email: false,
        google: false,
        magic: false,
        razorpay: false,
        currency: "INR",
      },
    }),
  );
  const requests: string[] = [];
  await page.route("**/api/operator/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/session"))
      return route.fulfill({ json: session });
    if (url.pathname.endsWith("/health"))
      return route.fulfill({ json: overview });
    await handler(route, url);
  });
  return requests;
}

async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((issue) =>
      ["serious", "critical"].includes(issue.impact || ""),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("the real operator API denies public reads and writes", async ({
  page,
  request,
}) => {
  for (const endpoint of [
    "session",
    "health",
    "cases",
    `cases/dispute/${firstCase.id}`,
  ]) {
    const response = await request.get(`/api/operator/${endpoint}`);
    expect(response.status()).toBe(e2eDatabaseUrl ? 401 : 503);
    const result = await response.json();
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("items");
    expect(result).not.toHaveProperty("operator");
  }
  const write = await request.post(
    `/api/operator/cases/dispute/${firstCase.id}`,
    {
      data: {
        note: "Public access must not record this note.",
        status: "closed",
        decision: "no_action",
        expectedVersion: 0,
      },
    },
  );
  expect(write.status()).toBe(e2eDatabaseUrl ? 401 : 503);
  await page.goto("/operator");
  await expect(
    page.getByRole("heading", {
      name: e2eDatabaseUrl
        ? "Operator access is restricted."
        : "The operator console is unavailable.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".operator-case-list, .operator-audit-list, .operator-summary",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save review", exact: true }),
  ).toHaveCount(0);
  await accessible(page);
});

test("access checks show a loading state and clear restricted access without queue reads", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let attempts = 0;
  const requests: string[] = [];
  await page.route("**/api/operator/**", async (route) => {
    requests.push(new URL(route.request().url()).pathname);
    attempts++;
    if (attempts === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      status: 403,
      json: { error: "Your account does not have operator access." },
    });
  });
  await page.goto("/operator");
  await expect(page.getByRole("status")).toContainText(
    "Check operator access.",
  );
  await expect.poll(() => typeof release).toBe("function");
  release!();
  await expect(
    page.getByRole("heading", { name: "Operator access is restricted." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check access again" }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(
    page.getByRole("heading", { name: "Operator access is restricted." }),
  ).toBeVisible();
  expect(requests).toEqual(["/api/operator/session", "/api/operator/session"]);
});

test("an invalid success response shows a recoverable error", async ({
  page,
}) => {
  let valid = false;
  await page.route("**/api/operator/session", (route) =>
    route.fulfill(
      valid
        ? {
            status: 403,
            json: { error: "Your account does not have operator access." },
          }
        : {
            status: 200,
            contentType: "text/html",
            body: "<html>Upstream response</html>",
          },
    ),
  );
  await page.goto("/operator");
  await expect(
    page.getByRole("heading", { name: "The operator console could not load." }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The console did not receive a valid response.",
  );
  valid = true;
  await page.getByRole("button", { name: "Check access again" }).click();
  await expect(
    page.getByRole("heading", { name: "Operator access is restricted." }),
  ).toBeVisible();
});

for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
] as const) {
  test(`case review controls are accessible and save an audited note on ${name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    let saved = false;
    let submitted: unknown;
    const requests = await mockConsole(page, async (route, url) => {
      if (url.pathname.endsWith("/cases"))
        return route.fulfill({
          json: { items: [firstCase], nextCursor: null },
        });
      if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        saved = true;
        return route.fulfill({
          json: {
            message:
              "Review saved. Payment and dispute records retain their state.",
            case: {
              ...firstCase,
              status: "waiting_provider",
              decision: "provider_review",
              version: 1,
            },
          },
        });
      }
      return route.fulfill({
        json: {
          case: saved
            ? {
                ...firstCase,
                status: "waiting_provider",
                decision: "provider_review",
                version: 1,
              }
            : firstCase,
          notes: saved ? [auditNote] : [],
          nextCursor: null,
        },
      });
    });
    await page.goto("/operator");
    const skip = page.getByRole("link", { name: "Skip to content", exact: true });
    await expect(skip).toHaveCSS("clip-path", "inset(50%)");
    await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toHaveCSS("clip-path", "none");
    await expect(
      page.getByText("Signed in as Approved operator"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Frontend skills interview/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "Case review", exact: true }),
    ).toBeFocused();
    await expect(page.getByText(firstCase.reason)).toBeVisible();
    const save = page.getByRole("button", { name: "Save review", exact: true });
    await expect(save).toBeDisabled();
    await page.getByLabel("New review status").selectOption("waiting_provider");
    await expect(page.getByLabel("Review outcome")).toHaveValue(
      "provider_review",
    );
    await page.getByLabel("Review note", { exact: true }).fill(auditNote.note);
    await expect(save).toBeEnabled();
    await accessible(page);
    for (const button of await page
      .locator("button:visible, a.button:visible")
      .all()) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const screenshot = testInfo.outputPath(`operator-${name}.png`);
    await page.screenshot({
      path: screenshot,
      fullPage: true,
      animations: "disabled",
    });
    await testInfo.attach(`Operator console ${name}`, {
      path: screenshot,
      contentType: "image/png",
    });
    await save.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Review saved." }),
    ).toBeVisible();
    await expect(page.locator(".operator-audit-list")).toContainText(
      auditNote.note,
    );
    expect(submitted).toEqual({
      note: auditNote.note,
      status: "waiting_provider",
      decision: "provider_review",
      expectedVersion: 0,
    });
    expect(requests.filter((entry) => entry.startsWith("POST"))).toEqual([
      `POST /api/operator/cases/dispute/${firstCase.id}`,
    ]);
    await expect(
      page.getByRole("button", { name: /Pay|Refund|Transfer|Release funds/i }),
    ).toHaveCount(0);
  });
}

test("case filters, page cursors, empty results, and queue errors retain clear recovery", async ({
  page,
}) => {
  let fail = false;
  await mockConsole(page, async (route, url) => {
    if (fail)
      return route.fulfill({
        status: 500,
        json: { error: "The queue could not load. Try again." },
      });
    if (url.searchParams.get("status") === "closed")
      return route.fulfill({ json: { items: [], nextCursor: null } });
    if (url.searchParams.get("cursor"))
      return route.fulfill({ json: { items: [secondCase], nextCursor: null } });
    return route.fulfill({
      json: { items: [firstCase], nextCursor: "second-page" },
    });
  });
  await page.goto("/operator");
  await expect(
    page.getByRole("button", { name: "Previous cases" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next cases" }).click();
  await expect(
    page.getByRole("button", { name: /Backend systems interview/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Next cases" })).toBeDisabled();
  await page.getByRole("button", { name: "Previous cases" }).click();
  await expect(
    page.getByRole("button", { name: /Frontend skills interview/ }),
  ).toBeVisible();
  await page
    .getByLabel("Review status", { exact: true })
    .selectOption("closed");
  await expect(
    page.getByRole("heading", { name: "No cases match these filters." }),
  ).toBeVisible();
  await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
  fail = true;
  await page.getByLabel("Case type").selectOption("repair");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The queue could not load.",
  );
  fail = false;
  await page.getByRole("button", { name: "Refresh console" }).click();
  await expect(
    page.getByRole("heading", { name: "No cases match these filters." }),
  ).toBeVisible();
});

test("a stale review preserves the draft and requires a fresh version before another save", async ({
  page,
}) => {
  let version = 0;
  let writes = 0;
  const payloads: unknown[] = [];
  await mockConsole(page, async (route, url) => {
    if (url.pathname.endsWith("/cases"))
      return route.fulfill({ json: { items: [firstCase], nextCursor: null } });
    if (route.request().method() === "POST") {
      payloads.push(route.request().postDataJSON());
      writes++;
      if (writes === 1) {
        version = 1;
        return route.fulfill({
          status: 409,
          json: { error: "This case changed. Refresh it before you save." },
        });
      }
      version = 2;
      return route.fulfill({
        json: {
          message:
            "Review saved. Payment and dispute records retain their state.",
          case: { ...firstCase, version },
        },
      });
    }
    return route.fulfill({
      json: {
        case: { ...firstCase, version },
        notes: version ? [auditNote] : [],
        nextCursor: null,
      },
    });
  });
  await page.goto("/operator");
  await page.getByRole("button", { name: /Frontend skills interview/ }).click();
  const note = page.getByLabel("Review note", { exact: true });
  await note.fill(
    "Reviewed the schedule evidence and requested more information.",
  );
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Another operator changed this case.",
  );
  await expect(note).toHaveValue(
    "Reviewed the schedule evidence and requested more information.",
  );
  await expect(
    page.getByRole("button", { name: "Save review", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload case" }).click();
  await expect(page.locator(".operator-audit-list")).toContainText(
    auditNote.note,
  );
  await expect(note).toHaveValue(
    "Reviewed the schedule evidence and requested more information.",
  );
  await expect(
    page.getByRole("button", { name: "Save review", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Review saved." }),
  ).toBeVisible();
  expect(payloads).toEqual([
    expect.objectContaining({ expectedVersion: 0 }),
    expect.objectContaining({ expectedVersion: 1 }),
  ]);
});

test("audit pagination keeps existing notes on failure and removes sensitive details when access ends", async ({
  page,
}) => {
  let fail = true;
  let revoked = false;
  await mockConsole(page, async (route, url) => {
    if (revoked)
      return route.fulfill({
        status: 403,
        json: { error: "Your account does not have operator access." },
      });
    if (url.pathname.endsWith("/cases"))
      return route.fulfill({ json: { items: [firstCase], nextCursor: null } });
    if (url.searchParams.get("cursor")) {
      if (fail)
        return route.fulfill({
          status: 500,
          json: { error: "Older notes could not load. Try again." },
        });
      return route.fulfill({
        json: {
          case: firstCase,
          notes: [
            {
              ...auditNote,
              id: "66666666-6666-4666-8666-666666666666",
              note: "An earlier review recorded the original schedule.",
            },
          ],
          nextCursor: null,
        },
      });
    }
    return route.fulfill({
      json: { case: firstCase, notes: [auditNote], nextCursor: "older-notes" },
    });
  });
  await page.goto("/operator");
  await page.getByRole("button", { name: /Frontend skills interview/ }).click();
  await page.getByRole("button", { name: "Load older notes" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Older notes could not load.",
  );
  await expect(page.locator(".operator-audit-list li")).toHaveCount(1);
  fail = false;
  await page.getByRole("button", { name: "Load older notes" }).click();
  await expect(page.locator(".operator-audit-list li")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Load older notes" }),
  ).toHaveCount(0);
  revoked = true;
  await page.getByRole("button", { name: "Reload case" }).click();
  await expect(
    page.getByRole("heading", { name: "Operator access is restricted." }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".operator-audit-list, .operator-case-list, .operator-summary",
    ),
  ).toHaveCount(0);
});
