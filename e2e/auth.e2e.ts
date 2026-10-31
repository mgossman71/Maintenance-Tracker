import { expect, test } from "@playwright/test";

/**
 * M3 happy paths on ONE vault (single-user app), narrative order:
 * first run → setup → shell & tabs → theme → session → logout → login.
 *
 * Playwright isolates contexts per test, so the first test exports its
 * session (storageState) and the authenticated suite inherits it.
 */

const PASSWORD = "correct-horse-battery";
const STATE = "/tmp/mt-e2e-state.json";

test("first run: setup screen, guards, then straight into the shell", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByTestId("setup-form")).toBeVisible();
  await expect(page.getByText("First run")).toBeVisible();

  // mismatch → inline guidance, submit disabled
  await page.getByTestId("setup-password").fill(PASSWORD);
  await page.getByTestId("setup-confirm").fill("different-password");
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
  await expect(page.getByTestId("setup-submit")).toBeDisabled();

  // too short → submit disabled
  await page.getByTestId("setup-password").fill("shorty");
  await page.getByTestId("setup-confirm").fill("shorty");
  await expect(page.getByTestId("setup-submit")).toBeDisabled();

  // real setup → auto-login into the empty dashboard
  await page.getByTestId("setup-password").fill(PASSWORD);
  await page.getByTestId("setup-confirm").fill(PASSWORD);
  await page.getByTestId("setup-submit").click();

  await expect(page.getByTestId("dashboard-page")).toBeVisible();
  await expect(page.getByText("Nothing to track yet")).toBeVisible();
  await context.storageState({ path: STATE });
});

test.describe("authenticated", () => {
  test.use({ storageState: STATE });

  test("session survives a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });

  test("nav reaches all three tabs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Equipment", exact: true }).click();
    await expect(page.getByTestId("equipment-page")).toBeVisible();
    await expect(page.getByText("No equipment yet")).toBeVisible();
    await expect(page.getByTestId("add-equipment-button")).toBeDisabled();

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("settings-page")).toBeVisible();
    await expect(page.getByTestId("appearance-pane")).toBeVisible();

    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });

  test("theme: dark is applied and persisted; auto is selectable", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => localStorage.getItem("mt_theme"))).toBe("dark");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByTestId("theme-light").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.getByTestId("theme-auto").click();
    expect(await page.evaluate(() => localStorage.getItem("mt_theme"))).toBe("auto");
  });

  test("logout revokes: deep links and back button land on /login", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/equipment");
    await expect(page).toHaveURL(/\/login/);
  });
});

test("login screen: one generic error, then success", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("login-form")).toBeVisible();

  await page.getByTestId("password-input").fill("definitely-wrong-9");
  await page
    .getByTestId("login-form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await expect(page.getByTestId("login-error")).toHaveText("Invalid password");

  await page.getByTestId("password-input").fill(PASSWORD);
  await page
    .getByTestId("login-form")
    .getByRole("button", { name: /sign in/i })
    .click();
  await expect(page.getByTestId("dashboard-page")).toBeVisible();
});
