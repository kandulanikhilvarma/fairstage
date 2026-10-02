import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

test("complete a funded round from both roles and export payment records", async ({
  page,
}) => {
  await page.goto("/workspace/interviews");
  const round = page
    .locator(".round-item")
    .filter({ hasText: "Skills interview" });
  await round.getByRole("button", { name: "Details" }).click();
  await round.getByRole("button", { name: "Confirm completion" }).click();
  await expect(
    round.getByText("Employer confirmed: Yes", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Candidate", exact: true }).click();
  await round.getByRole("button", { name: "Confirm completion" }).click();
  await round.getByRole("button", { name: "Simulate pay release" }).click();
  await expect(round.locator(".status")).toHaveText("Released");
  await page.reload();
  await expect(round.locator(".status")).toHaveText("Released");
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe(
    "fairstage-payment-records.csv",
  );
});
test("candidate accepts an offer before employer funding", async ({ page }) => {
  await page.goto("/workspace/interviews?role=candidate");
  const round = page.locator(".round-item").filter({ hasText: "Work sample" });
  await round.getByRole("button", { name: "Details" }).click();
  await round.getByRole("button", { name: "Accept terms" }).click();
  await expect(round.locator(".status")).toHaveText("accepted");
  await page.getByRole("button", { name: "Employer", exact: true }).click();
  await round.getByRole("button", { name: "Simulate funding" }).click();
  await expect(round.locator(".status")).toHaveText("funded");
  await expect(
    round.getByRole("button", { name: "Confirm completion" }),
  ).toHaveCount(0);
});
test("a dispute blocks release", async ({ page }) => {
  await page.goto("/workspace/interviews?role=candidate");
  const round = page
    .locator(".round-item")
    .filter({ hasText: "Skills interview" });
  await round.getByRole("button", { name: "Details" }).click();
  await round.getByRole("button", { name: "Open dispute" }).click();
  await round
    .getByLabel("Explain the problem")
    .fill("The agreed scope was not met during this round.");
  await round.getByRole("button", { name: "Submit dispute" }).click();
  await expect(round.locator(".status")).toHaveText("disputed");
  await expect(
    round.getByRole("button", { name: "Simulate pay release" }),
  ).toHaveCount(0);
});
test("create a job and accept an application in the demo", async ({ page }) => {
  await page.goto("/workspace/jobs");
  await page.getByRole("button", { name: "Post a job" }).click();
  await page
    .getByLabel("Role title", { exact: true })
    .fill("Accessibility engineer");
  await page.getByLabel("Location and remote policy").fill("Remote · Global");
  await page.getByLabel("Minimum annual salary").fill("90000");
  await page.getByLabel("Maximum annual salary").fill("120000");
  await page
    .getByLabel("Role and interview process")
    .fill(
      "Build accessible interfaces. Our interview rounds have a fixed scope, duration, and stated pay.",
    );
  await page.getByRole("button", { name: "Publish role" }).click();
  await expect(page.getByText("Job saved.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Candidate", exact: true }).click();
  await page.getByLabel("Search jobs").fill("Accessibility engineer");
  await page.getByRole("button", { name: "View role" }).click();
  await page
    .getByLabel("Tell the team why this role interests you")
    .fill(
      "I build accessible web interfaces and would like to discuss a relevant project.",
    );
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(
    page.getByText("Application saved.", { exact: false }),
  ).toBeVisible();
});
test("prepare a local guide and calculate a bonus without a salary deduction", async ({
  page,
}) => {
  await page.goto("/workspace/preparation");
  await page.getByRole("button", { name: "Create preparation guide" }).click();
  await expect(page.getByText("Source: Local preparation guide")).toBeVisible();
  await page.goto("/pricing");
  await page
    .getByLabel("Explore a proposed bonus credit", { exact: false })
    .check();
  await page.getByLabel("Separate signing bonus").fill("100");
  await expect(
    page.locator(".calc-line").filter({ hasText: "Base salary deduction" }),
  ).toHaveText("Base salary deduction$0");
  await expect(
    page.locator(".calc-line").filter({ hasText: "Proposed bonus credit" }),
  ).toHaveText("Proposed bonus credit$100");
});
test("demo API refuses real accounts and payments", async ({ request }) => {
  const register = await request.post("/api/auth/register", {
    data: { name: "Test Person" },
  });
  expect(register.status()).toBe(503);
  const webhook = await request.post("/api/webhooks/stripe", {
    data: { id: "fake" },
  });
  expect(webhook.status()).toBe(503);
});
test("public and workspace routes have no serious accessibility findings", async ({
  page,
}) => {
  for (const route of [
    "/",
    "/pricing",
    "/jobs",
    "/account",
    "/how-it-works",
    "/policy",
    "/privacy",
    "/open",
    "/workspace",
    "/workspace/interviews",
    "/workspace/wallet",
    "/workspace/preparation",
    "/workspace/settings",
    "/workspace/analytics",
    "/workspace/jobs",
  ]) {
    await page.goto(route);
    if (route.startsWith("/workspace"))
      await expect(page.locator(".avatar")).toHaveText("JC");
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
test("desktop and mobile pages fit the viewport and capture review images", async ({
  page,
}) => {
  await mkdir("docs/screenshots", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [label, route] of [
      ["home", "/"],
      ["workspace", "/workspace"],
    ]) {
      await page.goto(route);
      if (route.startsWith("/workspace"))
        await expect(page.locator(".avatar")).toHaveText("JC");
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${label} ${name}`,
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/${label}-${name}.png`,
        fullPage: false,
      });
      if (label === "home" && name === "desktop")
        await page.locator(".process-section").screenshot({
          path: "docs/screenshots/home-process-desktop.png",
        });
    }
  }
});
