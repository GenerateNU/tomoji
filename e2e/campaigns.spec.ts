import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-campaigns-tests-"));
  execFileSync("bun", ["e2e/fixtures/campaigns-build.mjs", directory]);
  bundle = readFileSync(join(directory, "campaigns-entry.js"), "utf8");
  css = readFileSync(join(directory, "campaigns.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.use({ timezoneId: "America/New_York" });

/** Renders production components against local responses, never live company data. */
async function openCampaigns(page: Page, scenario = "company") {
  await page.route("http://campaigns.test/**", async (route) => {
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
  await page.goto(`http://campaigns.test/?scenario=${scenario}`);
}

test("lists campaigns and resets pagination when the status changes", async ({ page }) => {
  await openCampaigns(page);
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText("$1,250.50").first()).toBeVisible();
  await expect(page.getByText("No end date")).toBeVisible();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(5);
  await page.getByLabel("Status").selectOption("draft");
  await expect(page.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByText("Developer tools launch")).toBeVisible();
  await page.getByLabel("Status").selectOption("");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(await page.evaluate(() => window.campaignsFixture.queries)).toEqual([
    { name: "campaigns:list", args: {} },
    { name: "campaigns:list", args: { status: "draft" } },
  ]);
});

test("does not query company campaigns before auth or for a creator", async ({ page }) => {
  await openCampaigns(page, "auth");
  await expect(page.getByRole("status")).toHaveText("Loading campaigns…");
  expect(await page.evaluate(() => window.campaignsFixture.queries)).toEqual([]);
  await page.evaluate(() => window.campaignsFixture.ready());
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await page.goto("http://campaigns.test/?scenario=creator");
  await expect(page.getByRole("alert")).toContainText("company account");
  expect(await page.evaluate(() => window.campaignsFixture.queries)).toEqual([]);
});

test("explains unsynced accounts and empty campaign lists", async ({ page }) => {
  await openCampaigns(page, "unsynced");
  await expect(page.getByRole("status")).toContainText("setting up");
  expect(await page.evaluate(() => window.campaignsFixture.queries)).toEqual([]);
  await page.goto("http://campaigns.test/?scenario=empty");
  await expect(page.getByText("No campaigns to show")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("query errors use the existing protected error boundary", async ({ page }) => {
  await openCampaigns(page, "query-error");
  await expect(page.getByRole("alert")).toContainText("Something went wrong loading this page.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
});

test("captures the responsive campaign list", async ({ page }) => {
  await openCampaigns(page);
  await expect(page.getByText("Owala Pastels")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("campaigns-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("campaigns-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
