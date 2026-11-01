import type { AppDatabase } from "@mt/db";
import { equipment, maintenanceTasks } from "@mt/db";
import type { DashboardDto, TaskStatusDto } from "@mt/shared";
import { todayLocalDate } from "@mt/shared";
import { isNull } from "drizzle-orm";
import type { ServerConfig } from "../config";
import { readSettings } from "./settings";
import { computeAllStatuses, STATUS_ORDER } from "./status";

/**
 * Dashboard: due-status for every active task, grouped by urgency.
 * Archived equipment and disabled tasks are excluded; Needs Baseline stays.
 */
export function buildDashboard(db: AppDatabase, config: ServerConfig): DashboardDto {
	const settings = readSettings(db);
	const today = todayLocalDate(config.timezone);

	const equipmentRows = db.select().from(equipment).where(isNull(equipment.archivedAt)).all();
	const equipmentById = new Map(equipmentRows.map((row) => [row.id, row]));

	const tasks = db
		.select()
		.from(maintenanceTasks)
		.all()
		.filter((task) => equipmentById.has(task.equipmentId) && task.enabled);

	const statuses = computeAllStatuses(db, tasks, settings, today);

	const items: Array<
		TaskStatusDto & {
			taskName: string;
			equipmentName: string;
			hasMiles: boolean;
			hasHours: boolean;
			currentMiles: number | null;
			currentHours: number | null;
		}
	> = [];
	for (const task of tasks) {
		const status = statuses.get(task.id);
		const eqRow = equipmentById.get(task.equipmentId);
		if (!status || !eqRow) continue;
		items.push({
			...status,
			taskName: task.name,
			equipmentName: eqRow.name,
			hasMiles: eqRow.hasMiles,
			hasHours: eqRow.hasHours,
			currentMiles: eqRow.currentMiles,
			currentHours: eqRow.currentHours,
		});
	}

	const groups = STATUS_ORDER.map((status) => ({
		status,
		items: items
			.filter((item) => item.status === status)
			.sort(
				(a, b) =>
					a.equipmentName.localeCompare(b.equipmentName) || a.taskId.localeCompare(b.taskId),
			),
	})).filter((group) => group.items.length > 0);

	// Stale-reading prompts per meter unit: a meter whose verification is old,
	// or that has meter-based tasks but no current reading at all.
	const staleCutoff = Date.now() - settings.staleReadingDays * 86_400_000;
	const taskSets = new Map<string, { miles: boolean; hours: boolean }>();
	for (const task of tasks) {
		const entry = taskSets.get(task.equipmentId) ?? { miles: false, hours: false };
		if (task.milesEnabled) entry.miles = true;
		if (task.hoursEnabled) entry.hours = true;
		taskSets.set(task.equipmentId, entry);
	}
	const staleReadingEquipment = equipmentRows
		.map((row) => {
			const needs = taskSets.get(row.id) ?? { miles: false, hours: false };
			const staleUnits: Array<"miles" | "hours"> = [];
			for (const unit of ["miles", "hours"] as const) {
				const has = unit === "miles" ? row.hasMiles : row.hasHours;
				if (!has) continue;
				const current = unit === "miles" ? row.currentMiles : row.currentHours;
				const verifiedAt = unit === "miles" ? row.milesVerifiedAt : row.hoursVerifiedAt;
				if (current === null) {
					if (needs[unit]) staleUnits.push(unit);
				} else if (verifiedAt !== null && new Date(verifiedAt).getTime() < staleCutoff) {
					staleUnits.push(unit);
				}
			}
			return staleUnits.length > 0 ? { id: row.id, name: row.name, staleUnits } : null;
		})
		.filter(
			(row): row is { id: string; name: string; staleUnits: Array<"miles" | "hours"> } =>
				row !== null,
		);

	return { groups, staleReadingEquipment, today };
}
