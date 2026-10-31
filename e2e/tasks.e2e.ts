import { expect, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * M5 story on the shared vault: task library is real (seeded + CRUD),
 * the picker prefills, meter tasks respect meterless equipment, expiry
 * tasks flip status by date, edits and deletes land.
 */

async function createEquipment(
  page: import("@playwright/test").Page,
  name: string,
  meter?: string,
) {
  await page.goto("/equipment");
  await page.getByTestId("add-equipment-button").click();
  await page.getByTestId("create-name").fill(name);
  if (meter) await page.getByTestId("create-meter").selectOption(meter);
  await page.getByTestId("create-submit").click();
  await expect(page.getByRole("link", { name })).toBeVisible();
}

test.describe("tasks + task library", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("settings: library is seeded and supports CRUD", async ({ page }) => {
    await page.goto("/settings");
    const pane = page.getByTestId("task-library-pane");
    await expect(pane).toBeVisible();
    await expect(pane.getByText("Oil change", { exact: true })).toBeVisible();
    await expect(pane.getByText("HVAC filter", { exact: true })).toBeVisible();

    // add
    await page.getByTestId("add-preset-button").click();
    await page.getByTestId("create-preset-name").fill("Chain lube");
    await page.getByTestId("create-preset-months").fill("1");
    await page.getByTestId("create-preset-submit").click();
    await expect(pane.getByText("Chain lube")).toBeVisible();

    // delete it again
    await page.getByRole("button", { name: "Delete Chain lube" }).click();
    await page.getByTestId("confirm-button").click();
    await expect(pane.getByText("Chain lube")).toHaveCount(0);
  });

  test("metered equipment: preset prefill → reading nudge; a reading starts the count", async ({
    page,
  }) => {
    await createEquipment(page, "Weekend Diesel", "miles");
    await page.getByRole("link", { name: "Weekend Diesel" }).click();
    await page.getByTestId("tab-tasks").click();

    await expect(page.getByTestId("tasks-pane")).toContainText("No tasks yet");
    await page.getByTestId("add-task-button").click();

    // pick the seeded preset — name + both intervals prefill, still editable
    const option = page.getByRole("option", { name: /^Oil change/ }).first();
    await page
      .getByTestId("create-preset")
      .selectOption((await option.getAttribute("value")) ?? "custom");
    await expect(page.getByTestId("create-task-name")).toHaveValue("Oil change");
    await expect(page.getByTestId("create-months")).toHaveValue("12");
    await expect(page.getByTestId("create-meter")).toHaveValue("5000");
    await page.getByTestId("create-task-submit").click();

    // no reading yet → amber "get a reading", never overdue-on-nothing
    const card = page.getByTestId("tasks-pane").locator("li").filter({ hasText: "Oil change" });
    await expect(card.getByTestId("due-chip-due-soon")).toBeVisible();

    // enter the odometer → the 5,000-mile count starts from there
    await page.getByTestId("tab-info").click();
    await page.getByTestId("reading-input").fill("2500");
    await page.getByTestId("reading-submit").click();
    await page.getByTestId("tab-tasks").click();
    await expect(card.getByTestId("due-chip-ok")).toBeVisible();
    await expect(card).toContainText("due at 7,500");

    // expiry task far in the future → OK
    await page.getByTestId("add-task-button").click();
    await page.getByTestId("create-preset").selectOption("custom");
    await page.getByTestId("create-task-name").fill("Registration");
    await page.getByTestId("create-kind-expiry").click();
    await expect(page.getByTestId("create-months")).toHaveCount(0);
    await page.getByTestId("create-expiry").fill("2099-01-01");
    await page.getByTestId("create-task-submit").click();

    const reg = page.getByTestId("tasks-pane").locator("li").filter({ hasText: "Registration" });
    await expect(reg.getByTestId("due-chip-ok")).toBeVisible();
    await expect(reg).toContainText("2099-01-01");
  });

  test("meterless equipment cannot carry a meter interval", async ({ page }) => {
    await createEquipment(page, "Garden Shed");
    await page.getByRole("link", { name: "Garden Shed" }).click();
    await page.getByTestId("tab-tasks").click();
    await page.getByTestId("add-task-button").click();

    const option = page.getByRole("option", { name: /^Oil change/ }).first();
    await page
      .getByTestId("create-preset")
      .selectOption((await option.getAttribute("value")) ?? "custom");
    // the meter field is dead here, and the reason is stated
    await expect(page.getByTestId("create-meter")).toBeDisabled();
    await expect(page.getByText("has no meter")).toBeVisible();
    // months survived the preset; submit works on months alone
    await expect(page.getByTestId("create-months")).toHaveValue("12");
    await page.getByTestId("create-task-submit").click();
    await expect(page.getByTestId("tasks-pane")).toContainText("Oil change");
  });

  test("edit: kind is locked; moving the expiry date moves the verdict", async ({ page }) => {
    await createEquipment(page, "Deadline Boat", "hours");
    await page.getByRole("link", { name: "Deadline Boat" }).click();
    await page.getByTestId("tab-tasks").click();

    await page.getByTestId("add-task-button").click();
    await page.getByTestId("create-preset").selectOption("custom");
    await page.getByTestId("create-task-name").fill("Registration");
    await page.getByTestId("create-kind-expiry").click();
    await page.getByTestId("create-expiry").fill("2099-01-01");
    await page.getByTestId("create-task-submit").click();
    const row = page.getByTestId("tasks-pane").locator("li").filter({ hasText: "Registration" });
    await expect(row.getByTestId("due-chip-ok")).toBeVisible();

    await row.getByRole("button", { name: "Edit Registration" }).click();
    await expect(page.getByTestId("edit-kind-interval")).toBeDisabled();
    await expect(page.getByTestId("edit-kind-expiry")).toBeDisabled();
    await page.getByTestId("edit-expiry").fill("2025-01-01");
    await page.getByTestId("edit-task-submit").click();
    await expect(row.getByTestId("due-chip-overdue")).toBeVisible();

    // delete lands, empty state returns
    await row.getByRole("button", { name: "Delete Registration" }).click();
    await page.getByTestId("confirm-button").click();
    await expect(page.getByTestId("tasks-pane")).toContainText("No tasks yet");
  });
});
