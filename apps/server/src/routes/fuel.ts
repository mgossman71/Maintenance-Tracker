import type { AppDatabase } from "@mt/db";
import { fuelLogCreateInput, fuelLogUpdateInput } from "@mt/shared";
import type { Hono } from "hono";
import type { ServerConfig } from "../config";
import { parse } from "../http/validation";
import { createFuelLog, deleteFuelLog, getFuelEconomy, updateFuelLog } from "../services/fuel";
import type { AppVariables } from "../types";
import { badRequest } from "../util";

export function registerFuelRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	_config: ServerConfig,
): void {
	// Full economy view: every fill-up with per-interval MPG + summary.
	// 400 for hours/none equipment — fuel economy is miles-only.
	app.get("/api/equipment/:id/fuel", (c) => {
		return c.json(getFuelEconomy(db, c.req.param("id")));
	});

	app.post("/api/equipment/:id/fuel", async (c) => {
		const input = parse(fuelLogCreateInput, await c.req.json().catch(() => null));
		// Schema flags null odometer as a field error; guard narrows for TS.
		if (input.odometer === null || input.odometer === undefined) {
			throw badRequest("Odometer reading is required");
		}
		return c.json(
			createFuelLog(db, c.req.param("id"), { ...input, odometer: input.odometer }),
			201,
		);
	});

	app.patch("/api/fuel/:id", async (c) => {
		const input = parse(fuelLogUpdateInput, await c.req.json().catch(() => null));
		return c.json(updateFuelLog(db, c.req.param("id"), input));
	});

	app.delete("/api/fuel/:id", (c) => {
		deleteFuelLog(db, c.req.param("id"));
		return c.json({ ok: true });
	});
}
