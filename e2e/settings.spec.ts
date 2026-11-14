import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-settings-hifis-"));
  execFileSync("bun", ["e2e/fixtures/settings-build.mjs", fixtureDirectory]);
  bundle = readFileSync(join(fixtureDirectory, "settings-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function openSettings(page: Page, query = "") {
  await page.route("http://settings.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/settings.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/settings.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/settings.css"></head><body><div id="root"></div><script type="module" src="/settings.js"></script></body></html>',
      });
    }
  });
  await page.goto(`http://settings.test/settings${query}`);
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
}

async function expectSelectedIndicator(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const selected = page.getByRole("tab", { selected: true });
  const indicator = page.locator('[data-slot="tabs-list"] > span[aria-hidden="true"]');
  await expect
    .poll(async () => {
      const tab = await selected.boundingBox();
      const underline = await indicator.boundingBox();
      return tab && underline
        ? Math.max(Math.abs(tab.x - underline.x), Math.abs(tab.width - underline.width))
        : Infinity;
    })
    .toBeLessThanOrEqual(1);
}

test("Payment is the default tab and unavailable Stripe cannot pretend to connect", async ({
  page,
}) => {
  await openSettings(page);
  await expect(page.getByRole("tab", { name: "Payment", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: /Continue with Stripe/i })).toBeDisabled();
  await expect(page.getByText("Stripe connected", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(page.getByText("zahra@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.calls)).toEqual([]);
  expect(await page.evaluate(() => window.settingsAuthFixture.calls)).toEqual([]);
});

test("password reset sends the current account email once and shows pending then confirmation", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.evaluate(() => window.settingsAuthFixture.delayReset());
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending link…", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.settingsAuthFixture.calls)).toEqual([
    { name: "requestPasswordReset", email: "zahra@example.test" },
  ]);
  await page.evaluate(() => window.settingsAuthFixture.releaseReset());
  await expect(page.getByRole("button", { name: "Reset link sent", exact: true })).toBeDisabled();
  await expect(
    page.getByText("Check zahra@example.test for a link to set a new password."),
  ).toBeVisible();
});

test("a failed password reset stays retryable without claiming a link was sent", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.evaluate(() => window.settingsAuthFixture.failNextReset());
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("We couldn't send your reset link");
  await expect(page.getByRole("button", { name: "Reset link sent", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset link sent", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.settingsAuthFixture.calls)).toHaveLength(2);
});

test("switching tabs retains reset confirmation and changing accounts clears it", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset link sent", exact: true })).toBeDisabled();
  await page.getByRole("tab", { name: "Payment", exact: true }).click();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset link sent", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.settingsAuthFixture.calls)).toHaveLength(1);
  await page.evaluate(() => window.settingsFixture.setProfile({ email: "alex@example.test" }));
  await expect(page.getByText("alex@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password", exact: true })).toBeEnabled();
});

test("logout invokes the existing session action", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Log out of account", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.settingsAuthFixture.calls))
    .toEqual([{ name: "signOut" }]);
});

for (const role of ["company", "operator"]) {
  test(`${role} accounts cannot access creator Settings`, async ({ page }) => {
    await openSettings(page, `?role=${role}`);
    await expect(
      page.getByText("Profile settings are currently available for creator accounts."),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Payment" })).toHaveCount(0);
    expect(await page.evaluate(() => window.settingsFixture.queries)).toEqual([
      { name: "users:me", args: {} },
    ]);
    expect(await page.evaluate(() => window.settingsAuthFixture.calls)).toEqual([]);
  });
}

test("loading and unsynced accounts do not invoke creator services", async ({ page }) => {
  await openSettings(page, "?account=loading");
  await expect(page.getByText("Loading settings…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.settingsFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);
  await page.evaluate(() =>
    window.settingsFixture.setSession({ userLoading: false, synced: false }),
  );
  await expect(
    page.getByText(
      "We’re finishing setting up your account. Your settings will appear here shortly.",
    ),
  ).toBeVisible();
  await page.evaluate(() => window.settingsFixture.setSession({ synced: true }));
  await expect(page.getByRole("tab", { name: "Payment" })).toBeVisible();
});

test("signed-out Settings asks for sign-in without loading private data", async ({ page }) => {
  await openSettings(page, "?auth=signed-out");
  await expect(page.getByRole("link", { name: "sign in", exact: true })).toHaveAttribute(
    "href",
    "/login?next=%2Fsettings",
  );
  expect(await page.evaluate(() => window.settingsFixture.queries)).toEqual([]);
});

test("Settings tabs work by keyboard and Payment and General fit desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await openSettings(page);
  await expectSelectedIndicator(page);
  await page.screenshot({
    path: testInfo.outputPath("settings-payment-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Payment", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "General", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expectSelectedIndicator(page);
  await page.screenshot({
    path: testInfo.outputPath("settings-general-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.evaluate(() =>
    window.settingsFixture.setProfile({
      email: "a-very-long-email-address-for-a-creator-with-several-names@example.test",
    }),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectSelectedIndicator(page);
  await page.screenshot({
    path: testInfo.outputPath("settings-general-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("tab", { name: "Payment", exact: true }).click();
  await expectSelectedIndicator(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath("settings-payment-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("signed-out visitors to the actual Settings route land on log in", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
