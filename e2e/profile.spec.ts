import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Id } from "../convex/_generated/dataModel";

let fixtureDirectory: string;
let bundle: string;
let css: string;

test.beforeAll(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), "tomoji-profile-tests-"));
  execFileSync("bun", [
    "e2e/fixtures/settings-build.mjs",
    fixtureDirectory,
    "e2e/fixtures/profile-entry.tsx",
  ]);
  bundle = readFileSync(join(fixtureDirectory, "profile-entry.js"), "utf8");
  css = readFileSync(join(fixtureDirectory, "settings.css"), "utf8");
});

test.afterAll(() => {
  if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true });
});

// Real Profile components with isolated query/media responses; no account writes.
async function openProfile(page: Page, query = "") {
  await page.route("http://profile.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/profile.js") {
      await route.fulfill({ contentType: "application/javascript", body: bundle });
    } else if (path === "/profile.css") {
      await route.fulfill({ contentType: "text/css", body: css });
    } else {
      await route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/profile.css"></head><body><div id="root"></div><script type="module" src="/profile.js"></script></body></html>',
      });
    }
  });
  await page.goto(`http://profile.test/profile${query}`);
  if (!query.includes("navOnly")) {
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
  }
}

test("creators see their own name, country, GitHub profile, and Settings link", async ({
  page,
}) => {
  await openProfile(page);
  await expect(page.getByRole("heading", { name: "Zahra Wibisana", exact: true })).toBeVisible();
  await expect(page.getByText("Indonesia", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /https:\/\/github.com\/zahra/ })).toHaveAttribute(
    "href",
    "https://github.com/zahra",
  );
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveAttribute(
    "href",
    "/settings",
  );
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByText("zahra@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("+1 617 555 0100", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
    { name: "creators:me", args: {} },
    { name: "countries:list", args: {} },
  ]);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("Profile navigation and Edit profile lead to the creator's own pages", async ({ page }) => {
  await openProfile(page);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveAttribute(
    "href",
    "/profile",
  );
  await page.getByRole("link", { name: "Edit profile", exact: true }).click();
  await expect(page).toHaveURL("http://profile.test/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Basic details" })).toBeVisible();
});

test("a failed navigation query preserves the shared shell and Profile returns when it recovers", async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on("pageerror", (error) => errors.push(error));
  await openProfile(page, "?navOnly&failedQuery=users%3Ame");
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute(
    "href",
    "/settings",
  );
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.profileFixture.setSession({ failedQuery: "" }));
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/profile",
  );
  expect(errors).toEqual([]);
});

test("signed-out component state prompts sign-in without requesting profile data", async ({
  page,
}) => {
  await openProfile(page, "?auth=signed-out");
  await expect(page.getByRole("link", { name: "sign in", exact: true })).toHaveAttribute(
    "href",
    "/login?next=%2Fprofile",
  );
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([]);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("authentication, user, and profile loading each resolve before displaying creator details", async ({
  page,
}) => {
  await openProfile(page, "?auth=loading&account=loading&profile=loading");
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([]);

  await page.evaluate(() =>
    window.profileFixture.setSession({ isAuthenticated: true, isLoading: false }),
  );
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);

  await page.evaluate(() => window.profileFixture.setSession({ userLoading: false }));
  await expect(page.getByText("Loading profile…", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
    { name: "creators:me", args: {} },
  ]);
  await page.evaluate(() => window.profileFixture.setSession({ profileLoading: false }));
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
});

test("unsynced accounts wait for account setup before requesting creator data", async ({
  page,
}) => {
  await openProfile(page, "?account=unsynced");
  await expect(page.getByRole("status")).toHaveText(
    "We’re finishing setting up your account. Your profile will appear here shortly.",
  );
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
    { name: "users:me", args: {} },
  ]);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
  await page.evaluate(() => window.profileFixture.setSession({ synced: true }));
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
});

for (const role of ["company", "operator"]) {
  test(`${role} accounts do not load creator profiles or pictures`, async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openProfile(page, `?role=${role}`);
    await expect(
      page.getByText("Creator profiles are currently available for creator accounts."),
    ).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.profileFixture.queries)).toEqual([
      { name: "users:me", args: {} },
    ]);
    expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("missing profile fields have clear empty states without exposing email fallback names", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "zahra@example.test",
      lastName: "",
      githubLink: undefined,
      countryOfResidence: undefined,
    }),
  );
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
  await expect(page.getByText("Indonesia", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No GitHub profile added yet.")).toBeVisible();
  await expect(page.getByText("No profile picture added.")).toBeVisible();
  await expect(page.getByText("zahra@example.test", { exact: true })).toHaveCount(0);
  await expect(page.getByText("+1 617 555 0100", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toBeVisible();
});

test("unsafe legacy GitHub URLs are never rendered as clickable links", async ({ page }) => {
  await openProfile(page);
  for (const githubLink of [
    "javascript:alert(1)",
    "https://github.com.evil.test/zahra",
    "https://example.test/zahra",
  ]) {
    await page.evaluate((link) => window.profileFixture.setGithubLink(link), githubLink);
    await expect(
      page.getByText(
        "Your saved GitHub link needs updating. Edit your profile to add a valid URL.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: githubLink })).toHaveCount(0);
    expect(
      await page
        .locator("a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ).toEqual(["/profile", "/settings"]);
  }
});

test("live updates refresh the displayed name, country, and GitHub URL", async ({ page }) => {
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "Alex",
      lastName: "Chen",
      githubLink: "https://github.com/alex-builds",
      countryOfResidence: "JP",
    }),
  );
  await expect(page.getByRole("heading", { name: "Alex Chen", exact: true })).toBeVisible();
  await expect(page.getByText("Japan", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /https:\/\/github.com\/alex-builds/ }),
  ).toHaveAttribute("href", "https://github.com/alex-builds");
  await expect(page.getByText("Indonesia", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([]);
});

test("private pictures load through the existing media reader and recover after a failed request", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() => {
    window.profileFixture.failNext("media:getProfilePicture");
    window.profileFixture.setProfile({
      profilePictureMediaId: "test-picture" as Id<"mediaUploads">,
    });
  });
  await expect(
    page.getByText("We couldn't load your picture. Try again or choose another one."),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zahra Wibisana" })).toBeVisible();
  await page.getByRole("button", { name: "Retry picture", exact: true }).click();
  const picture = page.getByAltText("Your profile picture", { exact: true });
  await expect(picture).toBeVisible();
  await expect(picture).toHaveJSProperty("naturalWidth", 1);
  expect(await page.evaluate(() => window.profileFixture.calls)).toEqual([
    { name: "media:getProfilePicture", args: { mediaId: "test-picture" } },
    { name: "media:getProfilePicture", args: { mediaId: "test-picture" } },
  ]);
});

test("removing a picture while its request is pending does not restore stale image data", async ({
  page,
}) => {
  await openProfile(page);
  await page.evaluate(() => {
    window.profileFixture.delayNext("media:getProfilePicture");
    window.profileFixture.setProfile({
      profilePictureMediaId: "test-picture" as Id<"mediaUploads">,
    });
  });
  await expect.poll(() => page.evaluate(() => window.profileFixture.calls.length)).toBe(1);
  await page.evaluate(() => {
    window.profileFixture.setProfile({ profilePictureMediaId: undefined });
    window.profileFixture.release("media:getProfilePicture");
  });
  await expect(page.getByText("No profile picture added.")).toBeVisible();
  await expect(page.getByAltText("Your profile picture", { exact: true })).toHaveCount(0);
});

test("creator profile fits a mobile viewport and links are keyboard accessible", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openProfile(page);
  await page.evaluate(() =>
    window.profileFixture.setProfile({
      firstName: "AnExtremelyLongFirstNameForResponsiveLayout",
      lastName: "AnEquallyLongLastNameForTheCreatorProfile",
      githubLink: "https://github.com/an-extremely-long-creator-username",
    }),
  );
  await page.keyboard.press("Tab");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Profile" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /https:\/\/github.com/ })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
});

test("creator profile displays its read-only details together on desktop", async ({
  page,
}, testInfo) => {
  await openProfile(page);
  await expect(page.getByRole("heading", { name: "Zahra Wibisana", exact: true })).toBeVisible();
  await expect(page.getByText("No profile picture added.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "GitHub profile", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });
});

test("signed-out visitors to the actual Profile route land on log in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
