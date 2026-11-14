import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let directory: string;
let bundle: string;
let css: string;
test.beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "tomoji-notifications-tests-"));
  execFileSync("bun", ["e2e/fixtures/notifications-build.mjs", directory]);
  bundle = readFileSync(join(directory, "notifications-entry.js"), "utf8");
  css = readFileSync(join(directory, "notifications.css"), "utf8");
});
test.afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
test.use({ timezoneId: "America/New_York" });

/** Loads production components with local service responses and the actual Figma SVGs. */
async function openInbox(page: Page, scenario = "ready") {
  await page.clock.install({ time: new Date("2026-10-15T13:00:00-04:00") });
  await page.route("http://notifications.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/app.js")
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    else if (path === "/app.css") await route.fulfill({ contentType: "text/css", body: css });
    else if (path.startsWith("/notifications/") && path.endsWith(".svg"))
      await route.fulfill({
        contentType: "image/svg+xml",
        body: readFileSync(join("public", path)),
      });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>',
      });
  });
  await page.goto(`http://notifications.test/?scenario=${scenario}`);
}

test("marks the selected notification read and groups loaded pages without duplicate headings", async ({
  page,
}) => {
  await openInbox(page);
  const first = page.getByRole("listitem").filter({ hasText: "Owala Pastels" });
  await first.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(first.getByText("Read", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.notificationsFixture.calls)).toEqual([
    { name: "notifications:markRead", args: { notificationId: "notification-0" } },
  ]);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Yesterday", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
});

test("mark all includes unloaded notifications and prevents duplicate submissions", async ({
  page,
}) => {
  await openInbox(page);
  await page.evaluate(() => {
    window.notificationsFixture.hold = true;
  });
  const markAll = page.getByRole("button", { name: "Mark all as read" });
  await markAll.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Marking all" })).toBeDisabled();
  await page.evaluate(() => window.notificationsFixture.release?.());
  await expect(markAll).toBeEnabled();
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByText("Unread", { exact: true })).toHaveCount(0);
  await expect(markAll).toBeDisabled();
  expect(await page.evaluate(() => window.notificationsFixture.calls)).toEqual([
    { name: "notifications:markAllRead", args: {} },
  ]);
});

test("a failed read action preserves unread state, hides raw errors, and can be retried", async ({
  page,
}) => {
  await openInbox(page);
  await page.evaluate(() => {
    window.notificationsFixture.fail = true;
  });
  const first = page.getByRole("listitem").filter({ hasText: "Owala Pastels" });
  await first.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Something went wrong. Try again.");
  await expect(first.getByText("Unread", { exact: true })).toHaveCount(1);
  await first.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(first.getByText("Read", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toBeHidden();
  await page.evaluate(() => {
    window.notificationsFixture.fail = true;
  });
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByRole("alert")).toHaveText("Something went wrong. Try again.");
  await expect(page.getByText("Unread", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("Unread", { exact: true })).toHaveCount(0);
});

test("waits for the Convex token, then shows an empty inbox", async ({ page }) => {
  await openInbox(page, "auth");
  await expect(page.getByRole("status")).toHaveText("Loading notifications…");
  await expect(page.getByText("You're all caught up")).toBeHidden();
  await page.evaluate(() => window.notificationsFixture.ready());
  await expect(page.getByRole("listitem")).toHaveCount(2);
  await page.goto("http://notifications.test/?scenario=empty");
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
});

test("date headings advance when the inbox stays open past midnight", async ({ page }) => {
  await openInbox(page);
  await page.clock.fastForward(11 * 60 * 60_000 + 60_000);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Yesterday", exact: true })).toHaveCount(1);
});

test("query failures use the existing page error boundary and support retry", async ({ page }) => {
  await openInbox(page, "query-error");
  await expect(page.getByRole("alert")).toContainText("Something went wrong loading this page.");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
});

test("desktop and mobile inboxes have no horizontal overflow", async ({ page }) => {
  await openInbox(page);
  await page.getByRole("button", { name: "Load more" }).click();
  await page.screenshot({
    path: test.info().outputPath("notifications-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath("notifications-mobile.png"),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const image of await page.locator("img").all())
    expect(
      await image.evaluate((element: HTMLImageElement) => element.naturalWidth),
    ).toBeGreaterThan(0);
});
