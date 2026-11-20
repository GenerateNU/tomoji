import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-company-home-"));
  execFileSync("bun", ["e2e/fixtures/company-home-build.mjs", directory]);
  bundle = readFileSync(join(directory, "company-home-entry.js"), "utf8");
  css = readFileSync(join(directory, "company-home.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.use({ timezoneId: "America/New_York", viewport: { width: 1512, height: 982 } });

/** Exercises the production home and navigation with isolated, explicitly synthetic data. */
async function openHome(page: Page, scenario = "populated") {
  await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
  await page.route("http://company-home.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/app.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>',
      });
  });
  await page.goto(`http://company-home.test/?scenario=${scenario}`);
}

test("renders the Figma summary and To-Do cards with live-shaped data", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("heading", { name: "Welcome back, Aaron!" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Spend", exact: true })).toContainText("$7,850");
  await expect(page.getByRole("region", { name: "Performance", exact: true })).toContainText(
    "1.2M Views",
  );
  await expect(
    page.getByRole("region", { name: "Offers Out", exact: true }).getByRole("button"),
  ).toHaveCount(6);
  await expect(page.getByRole("img", { name: "Observed post views this week" })).toBeVisible();
  await page.getByRole("button", { name: "View Offers", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Offers Out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create a campaign" })).toHaveAttribute(
    "href",
    "/campaigns/new",
  );
});

test("opens the existing review flow from a draft thumbnail", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Review Draft 1 by Jake Shane" }).click();
  await expect(page.getByRole("dialog", { name: "Draft 1" })).toBeVisible();
  await expect(page.getByLabel("Write a note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Request changes" })).toBeVisible();
});

test("shows Figma empty states and working destinations", async ({ page }) => {
  await openHome(page, "empty");
  await expect(
    page.getByRole("heading", { name: "All quiet on the Anthropic front" }),
  ).toBeVisible();
  await expect(page.getByText("No offers out", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing to review", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing to approve", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review All Drafts" })).toHaveAttribute(
    "href",
    "/submissions",
  );
});

test("loads once, preserves results during refresh, and can retry failed reads", async ({
  page,
}) => {
  await openHome(page, "loading");
  await expect(page.getByRole("status", { name: "Loading company dashboard" })).toBeVisible();
  await page.evaluate(() => window.companyHomeFixture.ready());
  await expect(page.getByText("1.2M Views", { exact: true })).toBeVisible();
  await page.evaluate(() => window.companyHomeFixture.beginRefresh());
  await expect(page.getByText("1.2M Views", { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading company dashboard" })).toBeHidden();
});

test("recovers from a failed dashboard read", async ({ page }) => {
  await openHome(page, "error");
  await expect(page.getByRole("alert")).toContainText("Couldn’t load your dashboard");
  await page.evaluate(() => window.companyHomeFixture.ready());
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("1.2M Views", { exact: true })).toBeVisible();
});

test("explains held earnings and hides approval for company members", async ({ page }) => {
  await openHome(page, "held");
  await expect(page.getByRole("region", { name: "Weekly earnings to approve" })).toContainText(
    "On hold",
  );
  await page.getByRole("button", { name: "Review Earnings" }).click();
  await expect(page.getByRole("dialog")).toContainText("On hold during an open dispute");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeHidden();
});

test("retries an approval failure without closing the earnings list", async ({ page }) => {
  await openHome(page);
  await page.getByRole("button", { name: "Review Earnings" }).click();
  await page.evaluate(() => window.companyHomeFixture.failApproval());
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Nothing to approve.");
});

test("labels partial totals and missing metrics", async ({ page }) => {
  await openHome(page, "partial");
  await expect(page.getByRole("status")).toContainText("Some totals and previews are partial");
});

test("keeps missing view metrics unknown instead of showing zero", async ({ page }) => {
  await openHome(page, "missing");
  await expect(page.getByRole("region", { name: "Performance", exact: true })).toContainText(
    "Views unavailable",
  );
  await expect(page.getByRole("img", { name: "Observed post views this week" })).toBeHidden();
});

test("lets members inspect earnings while hiding admin-only controls", async ({ page }) => {
  await openHome(page, "member");
  await expect(page.getByText("Ask an admin to create a campaign.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create a campaign" })).toBeHidden();
  await page.getByRole("button", { name: "Review Earnings" }).click();
  await expect(page.getByRole("dialog")).toContainText("only company admins can approve");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeHidden();
});

test("preserves the creator home", async ({ page }) => {
  await openHome(page, "creator");
  await expect(page.getByRole("heading", { name: "Welcome, Aaron" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Spend", exact: true })).toBeHidden();
});

test("captures desktop and mobile without horizontal overflow", async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole("heading", { name: "Welcome back, Aaron!" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: test.info().outputPath("company-home-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("company-home-mobile.png"),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
