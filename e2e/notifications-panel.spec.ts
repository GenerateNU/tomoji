import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-notifications-panel-tests-"));
  execFileSync("bun", ["e2e/fixtures/notifications-build.mjs", directory]);
  bundle = readFileSync(join(directory, "notifications-entry.js"), "utf8");
  css = readFileSync(join(directory, "notifications.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.use({ timezoneId: "America/New_York" });

/** Loads the real bell and panel against the local notifications service double. */
async function openBell(page: Page, scenario = "ready") {
  await page.clock.install({ time: new Date("2026-10-15T13:00:00-04:00") });
  await page.route("http://notifications.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js")
      await route.fulfill({
        contentType: "application/javascript",
        body: bundle,
      });
    else if (path === "/app.css") await route.fulfill({ contentType: "text/css", body: css });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>',
      });
  });
  await page.goto(`http://notifications.test/?view=panel&scenario=${scenario}`);
}

test("the bell shows the unread count and opens the panel newest first", async ({ page }) => {
  await openBell(page);
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByRole("button", { name: "Unreads 4" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("listitem").first()).toContainText(
    "You have an offer for Owala Pastels",
  );
  await expect(panel.getByText("Oct 15 at 12:00pm")).toBeVisible();
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(5);
});

test("clicking a notification opens its page, marks it read, and closes the panel", async ({
  page,
}) => {
  await openBell(page);
  const bell = page.getByRole("button", { name: "Notifications, 4 unread" });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("link", { name: /You have an offer for Owala Pastels/ }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Notifications, 3 unread" })).toBeVisible();
  expect(await page.evaluate(() => window.notificationsFixture.navigations)).toEqual([
    "/applications",
  ]);
  expect(await page.evaluate(() => window.notificationsFixture.calls)).toEqual([
    { name: "notifications:markRead", args: { notificationId: "notification-0" } },
  ]);
});

test("submission and assignment notifications open the assignment, read ones without a write", async ({
  page,
}) => {
  await openBell(page);
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: "Load more" }).click();
  await panel.getByRole("link", { name: /Hydroflask assignment was cancelled/ }).click();
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  await panel.getByRole("link", { name: /Jamba Juice video was approved/ }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.notificationsFixture.navigations)).toEqual([
    "/assignments/assignment",
    "/assignments/assignment",
  ]);
  expect(await page.evaluate(() => window.notificationsFixture.calls)).toEqual([
    { name: "notifications:markRead", args: { notificationId: "notification-1" } },
  ]);
});

test("a notification without a page is marked read in place from the Unreads filter", async ({
  page,
}) => {
  await openBell(page);
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: "Unreads 4" }).click();
  await expect(panel.getByRole("button", { name: /^Unreads/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(4);
  await expect(panel.getByText("Your Hydroflask assignment was cancelled")).toHaveCount(0);
  await panel.getByRole("button", { name: /dispute was opened.*\. Mark as read/ }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => window.notificationsFixture.navigations)).toEqual([]);
});

test("a failed read still opens the page and leaves the notification unread", async ({ page }) => {
  await openBell(page);
  await page.evaluate(() => {
    window.notificationsFixture.fail = true;
  });
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("link", { name: /Owala Pastels/ }).click();
  expect(await page.evaluate(() => window.notificationsFixture.navigations)).toEqual([
    "/applications",
  ]);
  await expect(page.getByRole("button", { name: "Notifications, 4 unread" })).toBeVisible();
});

test("a failed in-place read shows a friendly error", async ({ page }) => {
  await openBell(page);
  await page.evaluate(() => {
    window.notificationsFixture.fail = true;
  });
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: "Load more" }).click();
  await panel.getByRole("button", { name: /dispute was opened.*\. Mark as read/ }).click();
  await expect(panel.getByRole("alert")).toHaveText("Something went wrong. Try again.");
  await expect(panel.getByRole("button", { name: "Unreads 4" })).toBeVisible();
});

test("an empty inbox shows no dot and the empty message, and Escape closes the panel", async ({
  page,
}) => {
  await openBell(page, "empty");
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByRole("button", { name: "Unreads 0" })).toBeVisible();
  await expect(panel.getByText("No notifications yet.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});

test("the close button closes the panel, which fits desktop and mobile widths", async ({
  page,
}) => {
  await openBell(page);
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await page.screenshot({
    path: test.info().outputPath("notifications-panel-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("notifications-panel-mobile.png"),
  });
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Close notifications" }).click();
  await expect(panel).toBeHidden();
});

test("switching filters keeps the current rows, dimmed, until the new page loads", async ({
  page,
}) => {
  await openBell(page);
  await page.getByRole("button", { name: "Notifications, 4 unread" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(5);
  await page.evaluate(() => {
    window.notificationsFixture.holdUnread = true;
  });
  await panel.getByRole("button", { name: "Unreads 4" }).click();
  await expect(panel.getByRole("listitem")).toHaveCount(5);
  await expect(panel.locator("[aria-busy=true]")).toHaveCSS("opacity", "0.6");
  await expect(panel.getByRole("status")).toHaveText("");
  await expect(panel.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await page.evaluate(() => window.notificationsFixture.releaseUnread());
  await expect(panel.getByRole("listitem")).toHaveCount(4);
  await expect(panel.locator("[aria-busy=true]")).toHaveCount(0);
});

test("reopening the panel shows the loaded list without a loading state", async ({ page }) => {
  await openBell(page);
  const bell = page.getByRole("button", { name: "Notifications, 4 unread" });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await bell.click();
  await expect(panel.getByRole("listitem")).toHaveCount(2);
  await expect(panel.getByRole("status")).toHaveText("");
});
