import { expect, type Page, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

const NEW_PASSWORD = "a-brand-new-master-key";

/** Change the password from the Security pane and land back on the login screen. */
async function changePassword(page: Page, current: string, next: string) {
  await page.goto("/settings");
  await page.getByTestId("security-current").fill(current);
  await page.getByTestId("security-new").fill(next);
  await page.getByTestId("security-confirm").fill(next);
  await page.getByTestId("security-submit").click();
  await expect(page.getByTestId("login-form")).toBeVisible();
}

test.describe("settings: security & about (M8)", () => {
  test("security pane rejects a wrong current password", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.getByTestId("security-pane")).toBeVisible();

    await page.getByTestId("security-current").fill("definitely-not-it");
    await page.getByTestId("security-new").fill(NEW_PASSWORD);
    await page.getByTestId("security-confirm").fill(NEW_PASSWORD);
    await page.getByTestId("security-submit").click();

    await expect(page.getByTestId("security-error")).toContainText("not right");
    // still signed in — a failed change must not end the session
    await expect(page.getByTestId("settings-page")).toBeVisible();
  });

  test("client-side policy: short and mismatched passwords never submit", async ({ page }) => {
    await login(page);
    await page.goto("/settings");

    await page.getByTestId("security-current").fill(PASSWORD);
    await page.getByTestId("security-new").fill("short");
    await expect(page.getByTestId("security-too-short")).toBeVisible();
    await expect(page.getByTestId("security-submit")).toBeDisabled();

    await page.getByTestId("security-new").fill(NEW_PASSWORD);
    await page.getByTestId("security-confirm").fill(`${NEW_PASSWORD}x`);
    await expect(page.getByTestId("security-mismatch")).toBeVisible();
    await expect(page.getByTestId("security-submit")).toBeDisabled();
  });

  test("changing the password revokes every session — new password signs in", async ({ page }) => {
    await login(page);
    await changePassword(page, PASSWORD, NEW_PASSWORD);

    // the notice says what happened, and the OLD password is now dead
    await expect(page.getByTestId("login-notice")).toContainText("every device is signed out");
    await page.getByTestId("password-input").fill(PASSWORD);
    await page.getByTestId("login-form").press("Enter");
    await expect(page.getByTestId("login-error")).toContainText("Invalid password");

    // the NEW password works
    await page.getByTestId("password-input").fill(NEW_PASSWORD);
    await page.getByTestId("login-form").press("Enter");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });

  test("About pane is real, and the suite password is restored", async ({ page }) => {
    // signed in with NEW_PASSWORD from the previous test (shared vault, ordered)
    await login(page, NEW_PASSWORD);
    await page.goto("/settings");
    await expect(page.getByTestId("about-pane")).toContainText("self-hosted");

    await changePassword(page, NEW_PASSWORD, PASSWORD);
    // and back in with the original suite password for the specs that follow
    await page.getByTestId("password-input").fill(PASSWORD);
    await page.getByTestId("login-form").press("Enter");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });
});
