import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-creator-shell-"));
  execFileSync("bun", [
    "e2e/fixtures/settings-build.mjs",
    fixtureDirectory,
    "e2e/fixtures/creator-shell-entry.tsx",
  ]);
  bundle = readFileSync(join(fixtureDirectory, "creator-shell-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function openShell(page: Page, query = "") {
  await page.route("http://shell.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/shell.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/shell.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/shell.css"></head><body><div id="root"></div><script type="module" src="/shell.js"></script></body></html>',
      });
  });
  await page.goto(`http://shell.test/${query}`);
  await expect(page.getByRole("heading", { name: "Creator home", exact: true })).toBeVisible();
}

test("creator account menu opens Profile and returns focus after closing", async ({ page }) => {
  await openShell(page);
  const accountMenu = page.getByRole("button", { name: "Account menu", exact: true });
  await accountMenu.click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your profile", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(accountMenu).toBeFocused();
});

test("older profiles with missing collections can be viewed and edited without clearing data", async ({
  page,
}, testInfo) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await page.setViewportSize({ width: 1512, height: 982 });
  await openShell(page);
  // An older deployed creators.me may omit collections added to the current API.
  await page.evaluate(() =>
    window.shellFixture.setProfile({
      additionalLinks: undefined,
      languages: undefined,
      niches: undefined,
      skills: undefined,
    }),
  );
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Your profile", exact: true });
  await expect(dialog.getByRole("heading", { name: "Zahra Wibisana", exact: true })).toBeVisible();
  await expect(dialog.getByText("No niches selected.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("No skills selected.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Languages", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByLabel("GitHub profile", { exact: true }).fill("https://github.com/updated");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(dialog.getByRole("link", { name: /GitHub profile/ })).toHaveAttribute(
    "href",
    "https://github.com/updated",
  );
  expect(await page.evaluate(() => window.shellFixture.calls)).toEqual([
    { name: "creators:update", args: { githubLink: "https://github.com/updated" } },
  ]);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("profile-after-save-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath("profile-after-save-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("account menu links to Settings and missing routes are not exposed as working links", async ({
  page,
}) => {
  await openShell(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/settings",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Assignments", exact: true })).toHaveAttribute(
    "href",
    "/assignments",
  );
  await expect(page.getByRole("link", { name: "Earnings", exact: true })).toHaveCount(0);
});

test("account query failure preserves fallback navigation and recovers", async ({ page }) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await openShell(page, "?failedQuery=users%3Ame");
  await expect(page.getByRole("navigation", { name: "Fallback navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.shellFixture.setSession({ failedQuery: "" }));
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("company accounts retain the fallback shell", async ({ page }) => {
  await openShell(page, "?role=company");
  await expect(page.getByRole("navigation", { name: "Fallback navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.shellFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);
});

test("mobile account menu and profile dialog fit the viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openShell(page);
  await page.evaluate(() =>
    window.shellFixture.setProfile({
      niches: ["backend-development", "generative-ai", "design", "frontend-development"],
    }),
  );
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your profile", exact: true })).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Zahra Wibisana", exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("profile-dialog-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  const name = page
    .getByRole("dialog")
    .getByRole("heading", { name: "Zahra Wibisana", exact: true });
  await expect.poll(async () => (await name.boundingBox())?.height).toBeLessThanOrEqual(60);
  await expect.poll(async () => (await name.boundingBox())?.width).toBeGreaterThanOrEqual(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("profile-dialog-edit-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("combobox", { name: "Niches", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("profile-niches-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Add link", exact: true }).click();
  await page.getByLabel("Link 1", { exact: true }).fill("https://zahra.example.test");
  await page.getByLabel("Link 1", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("profile-portfolio-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("a profile query error stays inside the dialog and can be retried", async ({ page }) => {
  await openShell(page);
  await page.evaluate(() => window.shellFixture.setSession({ failedQuery: "creators:me" }));
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Something went wrong");
  await page.evaluate(() => window.shellFixture.setSession({ failedQuery: "" }));
  await page.getByRole("button", { name: "Retry profile", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Zahra Wibisana" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Creator home" })).toBeVisible();
});

test("a pending profile save cannot be dismissed or submitted twice", async ({ page }) => {
  await openShell(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("GitHub profile", { exact: true }).fill("https://github.com/saving");
  await page.evaluate(() => window.shellFixture.delayNext("creators:update"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => window.shellFixture.calls)).toHaveLength(1);
  await page.evaluate(() => window.shellFixture.release("creators:update"));
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("desktop profile modal displays saved metadata and scrollable editing controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await openShell(page);
  await page.evaluate(() =>
    window.shellFixture.setProfile({
      dateOfBirth: Date.UTC(2004, 9, 10),
      languages: ["english", "spanish"],
      niches: ["backend-development", "generative-ai", "design", "frontend-development"],
      skills: ["typescript", "python"],
      linkedinLink: "https://linkedin.com/in/zahra",
      additionalLinks: ["https://zahra.example.test"],
    }),
  );
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Profile", exact: true }).click();
  await expect(page.getByText("English, Spanish", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("profile-dialog-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("profile-dialog-edit-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Link 1", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("profile-portfolio-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
});
