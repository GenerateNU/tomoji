import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-onboarding-"));
  execFileSync("bun", ["e2e/fixtures/onboarding-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "onboarding-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "onboarding.css"), "utf8");
});
test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

/** Renders one onboarding step with the real components and stubbed services. */
async function openStep(page: Page, slug: string, extra = "") {
  await page.route("http://onboarding.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/fixture.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/fixture.css") await route.fulfill({ contentType: "text/css", body: css });
    // The artwork is supplied by the app, not the fixture.
    else if (path.endsWith(".webp")) await route.fulfill({ status: 204 });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
      });
  });
  await page.goto(`http://onboarding.test/?slug=${slug}${extra}`);
}

test("the first step offers connecting X and skipping ahead", async ({ page }) => {
  await openStep(page, "connect-x");

  await expect(
    page.getByRole("heading", { name: "Connect your X account to Ohani" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  expect(await page.evaluate(() => window.onboardingFixture.pushes)).toEqual([
    "/onboarding/basic-info",
  ]);
});

test("an empty basic info step reports every field and saves nothing", async ({ page }) => {
  await openStep(page, "basic-info");

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enter your date of birth as MM/DD/YYYY")).toBeVisible();
  await expect(page.getByText("Country required")).toBeVisible();
  await expect(page.getByText("Select at least one language")).toBeVisible();
  expect(await page.evaluate(() => window.onboardingFixture.calls)).toEqual([]);
});

test("correcting a field clears its own message", async ({ page }) => {
  await openStep(page, "basic-info");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter your date of birth as MM/DD/YYYY")).toBeVisible();

  await page.getByPlaceholder("MM/DD/YYYY").fill("09/10/2004");

  await expect(page.getByText("Enter your date of birth as MM/DD/YYYY")).toHaveCount(0);
  await expect(page.getByText("Country required")).toBeVisible();
});

test("the preview fills in as the creator types", async ({ page }, testInfo) => {
  await openStep(page, "basic-info");
  const preview = page.getByRole("article", { name: "Profile preview" });
  await expect(preview.getByText("Zahra Wibisana")).toBeVisible();

  await page.getByPlaceholder("MM/DD/YYYY").fill("09/10/2004");
  await page.getByText("Select country", { exact: true }).click();
  await page.getByRole("option", { name: "United States" }).click();

  await expect(preview.getByText("United States")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("onboarding-basic-info.png"),
    fullPage: true,
  });
});

test("saving basic info sends the date as a timestamp and moves on", async ({ page }) => {
  await openStep(page, "basic-info");
  await page.getByPlaceholder("MM/DD/YYYY").fill("09/10/2004");
  await page.getByText("Select country", { exact: true }).click();
  await page.getByRole("option", { name: "United States" }).click();
  await page.getByText("Select one or more languages").click();
  await page.getByRole("checkbox", { name: "English" }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Continue" }).click();

  expect(await page.evaluate(() => window.onboardingFixture.calls)).toEqual([
    {
      name: "creators:update",
      args: {
        dateOfBirth: Date.UTC(2004, 8, 10),
        countryOfResidence: "US",
        languages: ["english"],
      },
    },
  ]);
  expect(await page.evaluate(() => window.onboardingFixture.pushes)).toEqual([
    "/onboarding/content",
  ]);
});

test("an empty content step reports both selections", async ({ page }) => {
  await openStep(page, "content");

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Select at least one niche")).toBeVisible();
  await expect(page.getByText("Select at least one skill")).toBeVisible();
});

test("a portfolio link that isn't a URL blocks the save", async ({ page }) => {
  await openStep(page, "portfolio");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("zahra design");

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enter a valid URL")).toBeVisible();
  expect(await page.evaluate(() => window.onboardingFixture.calls)).toEqual([]);
});

test("finishing stores normalized links and completes onboarding", async ({ page }) => {
  await openStep(page, "portfolio");
  await page.getByLabel("GitHub Profile").fill("github.com/zahra");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("zahra.design");

  await page.getByRole("button", { name: "Continue" }).click();

  const calls = await page.evaluate(() => window.onboardingFixture.calls);
  expect(calls).toEqual([
    {
      name: "creators:update",
      args: {
        githubLink: "https://github.com/zahra",
        linkedinLink: null,
        additionalLinks: ["https://zahra.design/"],
      },
    },
    { name: "creators:completeOnboarding", args: {} },
  ]);
  expect(await page.evaluate(() => window.onboardingFixture.pushes)).toContain("/onboarding/ready");
});

test("captures the responsive onboarding steps", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStep(page, "content");
  await expect(page.getByRole("heading", { name: "What content do you make?" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("onboarding-content-mobile.png"),
    fullPage: true,
  });
});
