import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * M4 story on the shared vault (files run in order, single worker):
 * create → detail → meter update / same / explicit-correct → meter-kind
 * lock → delete from list AND from detail's danger zone.
 */

test.describe("equipment CRUD + meters", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("create a metered equipment from the list", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByTestId("add-equipment-button").click();

    // empty name → submit disabled
    await expect(page.getByTestId("create-submit")).toBeDisabled();

    await page.getByTestId("create-name").fill("Daily Driver");
    await page.getByTestId("create-icon").fill("🚗");
    await page.getByTestId("create-meter").selectOption("miles");
    await page.getByTestId("create-submit").click();

    const row = page.getByRole("link", { name: /Daily Driver/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/no reading yet/);
  });

  test("detail page: record first reading, then update it", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: /Daily Driver/ }).click();
    await expect(page.getByTestId("equipment-title")).toHaveText("🚗 Daily Driver");

    await expect(page.getByTestId("meter-current")).toContainText("No reading recorded yet");

    await page.getByTestId("reading-input").fill("12345");
    await page.getByTestId("reading-submit").click();
    await expect(page.getByTestId("meter-current")).toContainText("12,345 mi");
    await expect(page.getByTestId("meter-current")).toContainText("recorded today");

    // raise is business-as-usual
    await page.getByTestId("reading-input").fill("13000");
    await page.getByTestId("reading-submit").click();
    await expect(page.getByTestId("meter-current")).toContainText("13,000 mi");
  });

  test('"same reading" dismisses without touching the value', async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: /Daily Driver/ }).click();

    await page.getByTestId("same-reading-button").click();
    await expect(page.getByTestId("meter-current")).toContainText("13,000 mi");
    await expect(page.getByTestId("meter-error")).toHaveCount(0);
  });

  test("lowering needs the explicit correction flow — and only it lowers", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: /Daily Driver/ }).click();

    // typo: 1,300 was meant for 13,000 → the gate appears instead of a send
    await page.getByTestId("reading-input").fill("1300");
    await page.getByTestId("reading-submit").click();
    await expect(page.getByTestId("correction-confirm")).toBeVisible();
    await expect(page.getByTestId("meter-current")).toContainText("13,000 mi"); // untouched

    // canceling leaves the recorded reading alone
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("correction-confirm")).toHaveCount(0);
    await expect(page.getByTestId("meter-current")).toContainText("13,000 mi");

    // confirming corrects
    await page.getByTestId("reading-input").fill("1300");
    await page.getByTestId("reading-submit").click();
    await page.getByTestId("correction-confirm-button").click();
    await expect(page.getByTestId("meter-current")).toContainText("1,300 mi");
  });

  test("meter kind locks once readings exist", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("link", { name: /Daily Driver/ }).click();

    await page.getByTestId("edit-open").click();
    await expect(page.getByTestId("edit-meter")).toBeDisabled();
    await expect(page.getByText("Locked at miles — readings already exist")).toBeVisible();
    await page.getByTestId("edit-cancel").click();
  });

  test("delete from the list, with confirmation", async ({ page }) => {
    await page.goto("/equipment");
    await page.getByRole("button", { name: "Delete Daily Driver" }).click();
    await expect(page.getByText(/permanently deleted/)).toBeVisible();
    await page.getByTestId("confirm-button").click();

    await expect(page.getByText("No equipment yet")).toBeVisible();
  });

  test("meterless equipment: no-meter meter pane, delete from detail", async ({ page }) => {
    // create without a meter
    await page.goto("/equipment");
    await page.getByTestId("add-equipment-button").click();
    await page.getByTestId("create-name").fill("Boiler");
    await page.getByTestId("create-submit").click();
    await expect(page.getByRole("link", { name: "Boiler" })).toBeVisible();

    await page.getByRole("link", { name: "Boiler" }).click();
    await expect(page.getByTestId("meter-pane")).toContainText("No meter");
    await expect(page.getByTestId("reading-input")).toHaveCount(0);

    // danger zone deletes and navigates back to the (empty) list
    await page.getByTestId("delete-open").click();
    await page.getByTestId("confirm-button").click();
    await expect(page).toHaveURL(/\/equipment$/);
    await expect(page.getByText("No equipment yet")).toBeVisible();
  });
});
