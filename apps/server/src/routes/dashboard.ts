import {
  listEquipment,
  listInterventionsForEquipment,
  listTasksForEquipment,
} from "@maintenance-tracker/db";
import {
  type DashboardEquipment,
  type DashboardPayload,
  daysBetween,
  STALE_METER_DAYS,
  type TaskWithDue,
} from "@maintenance-tracker/shared";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { taskWithDue } from "./equipment.ts";

/**
 * GET /api/dashboard — the hero payload (M7). The engine runs server-side
 * (it's the same shared function), tasks arrive urgency-sorted, equipment
 * blocks sorted by urgency then name. Meter freshness is computed here so
 * the banner logic is one implementation, not two.
 */
export function dashboardRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/", (c) => {
    const today = deps.today();
    const equipment: DashboardEquipment[] = listEquipment(deps.db).map((eq) => {
      const interventions = listInterventionsForEquipment(deps.db, eq.id);
      const tasks: TaskWithDue[] = listTasksForEquipment(deps.db, eq.id).map((t) =>
        taskWithDue(deps, eq, t, interventions),
      );
      const rank = { overdue: 2, "due-soon": 1, ok: 0 } as const;
      tasks.sort((a, b) => rank[b.due.status] - rank[a.due.status] || a.name.localeCompare(b.name));
      const counts = {
        overdue: tasks.filter((t) => t.due.status === "overdue").length,
        dueSoon: tasks.filter((t) => t.due.status === "due-soon").length,
        ok: tasks.filter((t) => t.due.status === "ok").length,
      };

      let staleMeter: DashboardEquipment["staleMeter"] = null;
      if (eq.meterKind !== "none") {
        if (eq.reading === null) {
          staleMeter = {
            daysSince: Math.max(0, daysBetween(eq.createdAt.slice(0, 10), today)),
            reason: "never_recorded",
          };
        } else if (eq.readingUpdatedAt !== null) {
          const days = daysBetween(eq.readingUpdatedAt, today);
          if (days > STALE_METER_DAYS) staleMeter = { daysSince: days, reason: "old_reading" };
        }
      }
      return {
        id: eq.id,
        name: eq.name,
        description: eq.description,
        icon: eq.icon,
        meterKind: eq.meterKind as DashboardEquipment["meterKind"],
        reading: eq.reading,
        readingUpdatedAt: eq.readingUpdatedAt,
        staleMeter,
        tasks,
        counts,
      };
    });

    equipment.sort(
      (a, b) =>
        b.counts.overdue - a.counts.overdue ||
        b.counts.dueSoon - a.counts.dueSoon ||
        a.name.localeCompare(b.name),
    );

    const payload: DashboardPayload = {
      equipment,
      totals: {
        overdue: equipment.reduce((n, e) => n + e.counts.overdue, 0),
        dueSoon: equipment.reduce((n, e) => n + e.counts.dueSoon, 0),
      },
    };
    return c.json(payload);
  });

  return app;
}
