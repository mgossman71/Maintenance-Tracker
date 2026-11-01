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
			meterKind: string;
			currentMeter: number | null;
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
			meterKind: eqRow.meterKind,
			currentMeter: eqRow.currentMeter,
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

	// Stale-reading prompts: meter equipment whose verification is old, or that
	// has meter-based tasks but no current reading at all.
	const staleCutoff = Date.now() - settings.staleReadingDays * 86_400_000;
	const taskSets = new Map<string, { hasMeterTask: boolean }>();
	for (const task of tasks) {
		const entry = taskSets.get(task.equipmentId) ?? { hasMeterTask: false };
		if (task.meterEnabled) entry.hasMeterTask = true;
		taskSets.set(task.equipmentId, entry);
	}
	const staleReadingEquipment = equipmentRows
		.filter((row) => row.meterKind !== "none")
		.filter((row) => {
			const hasMeterTask = taskSets.get(row.id)?.hasMeterTask ?? false;
			if (row.currentMeter === null) return hasMeterTask;
			return row.meterVerifiedAt !== null && new Date(row.meterVerifiedAt).getTime() < staleCutoff;
		})
		.map((row) => ({ id: row.id, name: row.name, meterVerifiedAt: row.meterVerifiedAt }));

	return { groups, staleReadingEquipment, today };
}
