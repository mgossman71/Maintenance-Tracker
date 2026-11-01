import { expect, test } from "@playwright/test";

/**
 * Mandatory end-to-end scenario (build-plan.md §12). Runs against the real
 * server serving the production web build, driving the UI like a user.
 */

const PASSWORD = "correct-horse-battery";

async function login(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.waitForSelector("input[type=password]", { timeout: 15_000 });
	await page.getByLabel("Master password").fill(PASSWORD);
	await page.getByRole("button", { name: "Log in" }).click();
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15_000 });
}

async function addEquipment(
	page: import("@playwright/test").Page,
	fields: {
		name: string;
		/** unchecked passes false to remove the default mile meter. */
		miles?: boolean;
		hours?: boolean;
		current?: string;
		currentHours?: string;
	},
) {
	await page.getByRole("link", { name: "Equipment" }).first().click();
	await page.getByRole("button", { name: /Add equipment/ }).click();
	const dialog = page.getByRole("dialog", { name: "Add equipment" });
	await dialog.getByLabel("Name").fill(fields.name);
	if (fields.miles === false) await dialog.getByLabel("Has a mile meter").uncheck();
	if (fields.hours) await dialog.getByLabel("Has an hour meter").check();
	if (fields.current) {
		await dialog.getByLabel(/Current miles/).fill(fields.current);
	}
	if (fields.currentHours) {
		await dialog.getByLabel(/Current hours/).fill(fields.currentHours);
	}
	await dialog.getByRole("button", { name: "Add equipment" }).click();
	await expect(page.getByText(fields.name).first()).toBeVisible();
}

test.describe
	.serial("critical scenario §12 — oil change lifecycle", () => {
		test("first-run setup, truck, task, baseline edit, statuses, service, interval changes", async ({
			page,
		}) => {
			// 1. First-run password setup (login screen doubles as setup screen).
			await page.goto("/");
			await page.waitForSelector("input[type=password]", { timeout: 15_000 });
			await page.getByLabel("Master password").fill(PASSWORD);
			await page.getByLabel("Confirm password").fill(PASSWORD);
			await page.getByRole("button", { name: "Create password" }).click();
			await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({ timeout: 15_000 });

			// 2. Add truck with 12,000 miles
			await addEquipment(page, { name: "F-150", current: "12000" });

			// Open detail
			await page.getByText("F-150").first().click();

			// 3. Create Oil Change every 5,000 miles (no baseline yet)
			await page.getByRole("button", { name: /New task/ }).click();
			const taskDialog = page.getByRole("dialog", { name: "New maintenance task" });
			await taskDialog.getByLabel("Task name").fill("Oil Change");
			await taskDialog.getByPlaceholder("5000").fill("5000");
			await taskDialog.getByRole("button", { name: "Create task" }).click();
			await expect(taskDialog).toBeHidden();
			await expect(page.getByText("Needs baseline").first()).toBeVisible();

			// 4. Backfill prior oil change at 10,000 miles
			await page.getByRole("button", { name: "Record maintenance" }).first().click();
			const record = page.getByRole("dialog", { name: "Record maintenance" });
			await record.getByLabel("Date performed").fill("2026-01-10");
			await record.getByLabel(/Miles at service/).fill("10000");
			await record.getByRole("button", { name: "Save service" }).click();
			await expect(record).toBeHidden();

			// 5. Next due shows 15,000
			await expect(page.getByText("15,000 mi").first()).toBeVisible();

			// 6. Edit interval to 3,000; preview and result move to 13,000; history intact
			await page.getByRole("button", { name: "Edit interval" }).first().click();
			const editor = page.getByRole("dialog", { name: /Edit interval/ });
			await editor.getByPlaceholder("5000").fill("3000");
			await expect(editor.getByText(/13,000 mi/).first()).toBeVisible(); // live preview
			await editor.getByRole("button", { name: "Save interval" }).click();
			await expect(editor).toBeHidden();
			await expect(page.getByText("13,000 mi").first()).toBeVisible();
			await expect(page.getByText(/last done .* at 10,000 mi/)).toBeVisible();

			// 7-9. Reading updates drive DUE_SOON -> DUE -> OVERDUE
			const setReading = async (miles: string) => {
				await page.getByRole("tab", { name: "Info" }).click();
				await page.getByRole("button", { name: "Update reading" }).click();
				const dlg = page.getByRole("dialog", { name: "Update miles reading" });
				await dlg.getByLabel(/Current miles/).fill(miles);
				await dlg.getByRole("button", { name: "Save" }).click();
				await expect(dlg).toBeHidden();
				await page.getByRole("tab", { name: "Tasks" }).click();
			};

			await setReading("12600");
			await expect(page.getByText("Due soon").first()).toBeVisible();
			await setReading("13000");
			await expect(page.getByText("Due now").first()).toBeVisible();
			await setReading("13100");
			await expect(page.getByText("Overdue").first()).toBeVisible();

			// 10. Record the service at 13,100 -> next due 16,100, status OK
			await page.getByRole("button", { name: "Record maintenance" }).first().click();
			const service = page.getByRole("dialog", { name: "Record maintenance" });
			await service.getByLabel("Date performed").fill(new Date().toISOString().slice(0, 10));
			await service.getByLabel(/Miles at service/).fill("13100");
			await service.getByRole("button", { name: "Save service" }).click();
			await expect(service).toBeHidden();
			await expect(page.getByText("16,100 mi").first()).toBeVisible();
			await expect(page.getByText("OK").first()).toBeVisible();

			// 11. History tab shows both events
			await page.getByRole("tab", { name: "History" }).click();
			await expect(page.getByText("Oil Change", { exact: true })).toHaveCount(2);

			// 12. Interval 4,000 -> next due 17,100, history untouched
			await page.getByRole("tab", { name: "Tasks" }).click();
			await page.getByRole("button", { name: "Edit interval" }).first().click();
			const editor2 = page.getByRole("dialog", { name: /Edit interval/ });
			await editor2.getByPlaceholder("5000").fill("4000");
			await editor2.getByRole("button", { name: "Save interval" }).click();
			await expect(editor2).toBeHidden();
			await expect(page.getByText("17,100 mi").first()).toBeVisible();
		});
	});

test("hours equipment — 100-hour ATV shows DUE_SOON at 145h", async ({ page }) => {
	await login(page);

	await addEquipment(page, { name: "Raptor ATV", miles: false, hours: true, currentHours: "145" });
	await page.getByText("Raptor ATV").first().click();

	// Task: every 100 hours, baseline 50 hours on 2026-06-01
	await page.getByRole("button", { name: /New task/ }).click();
	const dialog = page.getByRole("dialog", { name: "New maintenance task" });
	await dialog.getByLabel("Task name").fill("ATV Oil");
	await dialog.getByPlaceholder("50").fill("100");
	await dialog.getByLabel("Baseline date").fill("2026-06-01");
	await dialog.getByPlaceholder(/Last hours/).fill("50");
	await dialog.getByRole("button", { name: "Create task" }).click();
	await expect(dialog).toBeHidden();

	// Next due 150 hours; 5 hours left is inside the 10-hour warn band.
	await expect(page.getByText("150 h").first()).toBeVisible();
	await expect(page.getByText("Due soon").first()).toBeVisible();
});

test("dashboard aggregates statuses", async ({ page }) => {
	await login(page);
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
	// From the previous tests: Oil Change (OK at 16,100/17,100) and ATV Oil (DUE_SOON).
	await expect(page.getByText("ATV Oil").first()).toBeVisible();
});

test("dashboard: quick mileage update from a task row", async ({ page }) => {
	await login(page);
	await page.goto("/");
	// ATV Oil is DUE_SOON (145h of 150h). Bump the hour meter to 149h from the
	// dashboard row — still due-soon, but proves the quick update lands + recalcs.
	await page.getByRole("button", { name: "Update reading for Raptor ATV" }).click();
	const dialog = page.getByRole("dialog", { name: "Update Raptor ATV" });
	await expect(dialog.getByLabel("Current hours")).toHaveValue("145");
	await dialog.getByLabel("Current hours").fill("149");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(dialog).toBeHidden();
	// Dashboard refreshes: 149/150 leaves ~1h, still Due soon, now nearer.
	await expect(page.getByText("ATV Oil").first()).toBeVisible();
	await expect(page.getByText("Due soon").first()).toBeVisible();
	await expect(page.getByText(/1 h left/).first()).toBeVisible();
	// Reopen: the saved value persisted.
	await page.getByRole("button", { name: "Update reading for Raptor ATV" }).click();
	await expect(
		page.getByRole("dialog", { name: "Update Raptor ATV" }).getByLabel("Current hours"),
	).toHaveValue("149");
});

test("fuel economy: fill-ups compute MPG; tab hidden on hours equipment", async ({ page }) => {
	await login(page);
	await page.getByRole("link", { name: "Equipment" }).first().click();
	await page.getByText("F-150").first().click();

	await page.getByRole("tab", { name: "Fuel" }).click();
	await expect(page.getByText("No fill-ups yet")).toBeVisible();

	// Baseline fill-up at the prefilled odometer: 10 gal @ $3.00.
	await page.getByRole("button", { name: "Log your first fill-up" }).click();
	let dlg = page.getByRole("dialog", { name: "Add fill-up" });
	await expect(dlg.getByLabel("Odometer (miles)")).toHaveValue("13100");
	await dlg.getByLabel("Gallons").fill("10");
	await dlg.getByLabel(/Price per gallon/).fill("3");
	await dlg.getByRole("button", { name: "Add fill-up" }).click();
	await expect(dlg).toBeHidden();

	// Four intervals (100 mi each) with MPG 20.0, 16.7, 20.0, 14.3.
	for (const [odo, gal] of [
		["13200", "5"],
		["13300", "6"],
		["13400", "5"],
		["13500", "7"],
	] as const) {
		await page.getByRole("button", { name: "Add fill-up" }).first().click();
		dlg = page.getByRole("dialog", { name: "Add fill-up" });
		await dlg.getByLabel("Odometer (miles)").fill(odo);
		await dlg.getByLabel("Gallons").fill(gal);
		await dlg.getByRole("button", { name: "Add fill-up" }).click();
		await expect(dlg).toBeHidden();
	}

	await expect(page.getByText("20.0 mpg").first()).toBeVisible();
	await expect(page.getByText("Last MPG")).toBeVisible();
	await expect(page.getByText("Blended MPG")).toBeVisible();
	// Priced fill-ups only: 10 gal x $3.00 = $30.00 (row + total).
	await expect(page.getByText("$30.00").first()).toBeVisible();

	// Trend row: last-3 avg 17.0 vs earlier 20.0 -> down 3.0; best/worst.
	await expect(page.getByText(/3\.0 vs earlier/)).toBeVisible();
	await expect(page.getByText("Best 20.0 mpg").first()).toBeVisible();
	await expect(page.getByText("Worst 14.3 mpg").first()).toBeVisible();

	// Delete the newest fill-up: with only 3 intervals left the trend
	// falls back to the "log more" message and 14.3 disappears entirely.
	await page
		.getByRole("button", { name: /Delete fill-up from/ })
		.first()
		.click();
	await expect(page.getByText("14.3 mpg")).toHaveCount(0);
	await expect(page.getByText(/few more fill-ups/)).toBeVisible();
	await expect(page.getByText("Worst 16.7 mpg").first()).toBeVisible();

	// Hours-based equipment has no Fuel tab at all.
	await page.getByRole("link", { name: "Equipment" }).first().click();
	await page.getByText("Raptor ATV").first().click();
	await expect(page.getByRole("tab", { name: "Fuel" })).toHaveCount(0);
});

test("fuel page: quick fill-up from the nav, no equipment detour", async ({ page }) => {
	await login(page);
	await page.getByRole("link", { name: "Fuel" }).first().click();
	await expect(page.getByRole("heading", { name: "Fuel" })).toBeVisible();
	// Miles vehicles get a card; the hours ATV does not exist here.
	await expect(page.getByText("F-150").first()).toBeVisible();
	await expect(page.getByText("Raptor ATV")).toHaveCount(0);

	// Quick add straight from the card (state from earlier tests: fill-ups
	// through 13,400 mi, odometer at 13,100, one priced at $30.00).
	await page.getByRole("button", { name: "Add fill-up for F-150" }).click();
	const dlg = page.getByRole("dialog", { name: "Add fill-up" });
	await expect(dlg.getByLabel("Odometer (miles)")).toHaveValue("13100");
	await dlg.getByLabel("Odometer (miles)").fill("13600");
	await dlg.getByLabel("Gallons").fill("14");
	await dlg.getByLabel(/Price per gallon/).fill("3.25");
	await dlg.getByRole("button", { name: "Add fill-up" }).click();
	await expect(dlg).toBeHidden();

	// Card stats recalculate live: 200 mi / 14 gal = 14.3 Last MPG; total
	// cost $30.00 + 14 x $3.25 = $75.50.
	await expect(page.getByText("14.3").first()).toBeVisible();
	await expect(page.getByText("$75.50").first()).toBeVisible();
});

test("dashboard: one card per vehicle holding all of its tasks", async ({ page }) => {
	await login(page);
	await page.goto("/");
	// Exactly two vehicles -> exactly two cards.
	await expect(page.locator("[data-vehicle]")).toHaveCount(2);
	// Each task lives inside its own vehicle's card.
	const truckCard = page.locator("[data-vehicle]", { hasText: "F-150" });
	const atvCard = page.locator("[data-vehicle]", { hasText: "Raptor ATV" });
	await expect(truckCard.getByText("Oil Change")).toBeVisible();
	await expect(atvCard.getByText("ATV Oil")).toBeVisible();
	// Card ordering follows urgency: Due-soon ATV (149/150 h) beats OK truck.
	await expect(page.locator("[data-vehicle]").first()).toContainText("Raptor ATV");
	// One reading control per vehicle, not per task.
	await expect(page.getByRole("button", { name: /Update reading for/ })).toHaveCount(2);
	// Per-task action scoping: the truck card offers its own service row.
	await truckCard.getByRole("button", { name: "Record service for Oil Change" }).click();
	await expect(page.getByRole("dialog", { name: "Record maintenance" })).toBeVisible();
	await page.keyboard.press("Escape");
});

test("dual meters — '500 mi or 50 h, whichever comes first'", async ({ page }) => {
	await login(page);
	await addEquipment(page, {
		name: "Tractor",
		hours: true,
		current: "1200",
		currentHours: "300",
	});
	await page.getByText("Tractor").first().click();

	// Task on both clocks: due 1,500 mi / 290 h from a 2026-01-01 baseline.
	await page.getByRole("button", { name: /New task/ }).click();
	const dialog = page.getByRole("dialog", { name: "New maintenance task" });
	await dialog.getByLabel("Task name").fill("Tractor Oil");
	await dialog.getByPlaceholder("5000").fill("500");
	await dialog.getByLabel("Enable hours interval").click();
	await dialog.getByPlaceholder("50", { exact: true }).fill("50");
	await dialog.getByLabel("Baseline date").fill("2026-01-01");
	await dialog.getByLabel("Baseline miles").fill("1000");
	await dialog.getByLabel("Baseline hours").fill("240");
	await expect(dialog.getByText(/1,500 mi .* 290 h/)).toBeVisible(); // preview: both dimensions
	await dialog.getByRole("button", { name: "Create task" }).click();
	await expect(dialog).toBeHidden();

	// Hours clock (300 h, due 290 h) is overdue -> whole task overdue.
	await expect(page.getByText("Overdue").first()).toBeVisible();
	await expect(page.getByText(/at 290 h/).first()).toBeVisible();
	await expect(page.getByText(/at 1,500 mi/).first()).toBeVisible();

	// Service with both readings resets both clocks.
	await page.getByRole("button", { name: "Record maintenance" }).first().click();
	const service = page.getByRole("dialog", { name: "Record maintenance" });
	await service.getByLabel("Date performed").fill("2026-07-01");
	await expect(service.getByLabel(/Miles at service/)).toHaveValue("1200");
	await service.getByLabel(/Hours at service/).fill("300.5");
	await service.getByRole("button", { name: "Save service" }).click();
	await expect(service).toBeHidden();

	// Hours now due at 350.5 h (OK); miles stays due-soon at 1,500 mi.
	await expect(page.getByText(/at 350\.5 h/).first()).toBeVisible();
	await expect(page.getByText("Due soon").first()).toBeVisible();

	// Skipping a clock keeps it where it was — with an explicit warning.
	await page.getByRole("button", { name: "Record maintenance" }).first().click();
	const second = page.getByRole("dialog", { name: "Record maintenance" });
	await second.getByLabel("Date performed").fill("2026-08-01");
	await second.getByLabel(/Hours at service/).fill("");
	await second.getByRole("button", { name: "Save service" }).click();
	await expect(second.getByText(/No hours reading entered/)).toBeVisible();
	await second.getByRole("button", { name: "Cancel" }).click();
	await expect(second).toBeHidden();

	// Both meters show in the header and the Info tab has two panels.
	await expect(page.getByText("1,200 mi").first()).toBeVisible();
	await page.getByRole("tab", { name: "Info" }).click();
	await expect(page.getByText("Mile meter")).toBeVisible();
	await expect(page.getByText("Hour meter")).toBeVisible();
});
