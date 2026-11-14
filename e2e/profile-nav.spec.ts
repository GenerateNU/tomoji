import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

let fixtureDirectory: string;
let bundle: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-profile-navigation-"));
  // Keep the real Convex React hooks: replacing useQueries would hide subscription render loops.
  execFileSync("bun", [
    "build",
    "e2e/fixtures/profile-nav-entry.tsx",
    "--outdir",
    fixtureDirectory,
    "--target",
    "browser",
    "--define",
    'process.env={"NODE_ENV":"development"}',
  ]);
  bundle = readFileSync(join(fixtureDirectory, "profile-nav-entry.js"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

async function openNavigation(page: Page, query = "") {
  await page.route("http://navigation.test/**", async (route) => {
    await route.fulfill(
      new URL(route.request().url()).pathname === "/fixture.js"
        ? { contentType: "application/javascript", body: bundle }
        : {
            contentType: "text/html",
            body: '<!doctype html><html lang="en"><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>',
          },
    );
  });
  await page.goto(`http://navigation.test/${query}`);
  await page.waitForFunction(
    () => window.navigationFixture?.errors.length || document.querySelector("nav"),
  );
}

test("Profile navigation renders with real Convex subscriptions without a render loop", async ({
  page,
}) => {
  await openNavigation(page);
  expect(await page.evaluate(() => window.navigationFixture.errors)).toEqual([]);
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Refresh shell 0" }).click();
  await expect(page.getByRole("button", { name: "Refresh shell 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.navigationFixture.errors)).toEqual([]);
});

for (const auth of ["signed-out", "loading"]) {
  test(`${auth} navigation skips profile data and safely responds to sign-in and sign-out`, async ({
    page,
  }) => {
    await openNavigation(page, `?auth=${auth}`);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.navigationFixture.queries)).toEqual([]);
    await page.getByRole("button", { name: "Refresh shell 0" }).click();
    await expect(page.getByRole("button", { name: "Refresh shell 1" })).toBeVisible();

    await page.evaluate(() =>
      window.navigationFixture.setSession({ isLoading: false, isAuthenticated: true }),
    );
    await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.navigationFixture.queries)).toEqual(["users:me"]);

    await page.evaluate(() => window.navigationFixture.setSession({ isAuthenticated: false }));
    await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.navigationFixture.errors)).toEqual([]);
  });
}

test("Profile navigation reacts to account states and recovers from query errors", async ({
  page,
}) => {
  await openNavigation(page);
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();

  for (const result of [
    undefined,
    { synced: false },
    { synced: true, role: "company" },
    { synced: true, role: "operator" },
  ]) {
    await page.evaluate((value) => window.navigationFixture.setResult(value), result);
    await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  }

  await page.evaluate(() => window.navigationFixture.failQuery());
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await page.evaluate(() => window.navigationFixture.setResult({ synced: true, role: "creator" }));
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.navigationFixture.errors)).toEqual([]);
});
