import {
  deleteIntervention,
  type EquipmentRow,
  getEquipment,
  getIntervention,
  getTask,
  insertIntervention,
  updateEquipment,
  updateIntervention,
  updateTask,
} from "@maintenance-tracker/db";
import { interventionCreateSchema, interventionUpdateSchema } from "@maintenance-tracker/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail, failValidation } from "../http/errors.ts";
import { readBody } from "./equipment.ts";

/**
 * Create an intervention on `eq`. Rules encoded (build-plan §2/§4):
 *  - exactly one of taskId (task work) or label (equipment-level work) — zod
 *  - the task must belong to this equipment (409)
 *  - meterAt never lowers the meter (409) and requires a metered equipment
 *  - mileage progression: a higher meterAt advances the equipment reading
 *  - expiry rollforward: an expiryDate on expiry-task work updates the task
 */
export function createInterventionForEquipment(
  deps: AppDeps,
  c: Context,
  eq: EquipmentRow,
  body: unknown,
) {
  const parsed = interventionCreateSchema.safeParse(body);
  if (!parsed.success) return failValidation(c, parsed.error);
  const d = parsed.data;

  let taskRow: ReturnType<typeof getTask> | null = null;
  if (d.taskId != null) {
    taskRow = getTask(deps.db, d.taskId);
    if (taskRow === null) return fail(c, "not_found", 404);
    if (taskRow.equipmentId !== eq.id) {
      return fail(c, "task_equipment_mismatch", 409, {
        message: "task belongs to different equipment",
      });
    }
  }

  if (d.meterAt != null) {
    if (eq.meterKind === "none") return fail(c, "meterless_equipment", 409);
    if (eq.reading !== null && d.meterAt < eq.reading) {
      return fail(c, "meter_regressed", 409, {
        message: `meterAt cannot go below current reading ${eq.reading}`,
      });
    }
  }

  const row = insertIntervention(deps.db, {
    taskId: d.taskId ?? null,
    equipmentId: eq.id,
    label: d.label ?? null,
    date: d.date,
    meterAt: d.meterAt ?? null,
    location: d.location ?? null,
    performedBy: d.performedBy ?? null,
    comments: d.comments ?? null,
    expiryDate: d.expiryDate ?? null,
  });

  // mileage progression — work done further along moves the meter forward
  if (d.meterAt != null && (eq.reading === null || d.meterAt > eq.reading)) {
    updateEquipment(deps.db, eq.id, { reading: d.meterAt, readingUpdatedAt: d.date });
  }
  // expiry tasks: the work establishes the next expiry date
  if (taskRow !== null && taskRow.kind === "expiry" && d.expiryDate != null) {
    updateTask(deps.db, taskRow.id, { currentExpiryDate: d.expiryDate });
  }
  return c.json(row, 201);
}

/** GET/PATCH/DELETE /api/interventions/:id */
export function interventionsRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/:id", (c) => {
    const row = getIntervention(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    return c.json(row);
  });

  app.patch("/:id", async (c) => {
    const row = getIntervention(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    const parsed = interventionUpdateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);

    // Invariant: a stored meterAt may never sit below the current reading.
    if (parsed.data.meterAt != null) {
      const eq = getEquipment(deps.db, row.equipmentId);
      if (eq !== null && eq.reading !== null && parsed.data.meterAt < eq.reading) {
        return fail(c, "meter_regressed", 409, {
          message: `meterAt cannot go below current reading ${eq.reading}`,
        });
      }
    }
    return c.json(updateIntervention(deps.db, row.id, parsed.data));
  });

  app.delete("/:id", (c) => {
    const row = getIntervention(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    deleteIntervention(deps.db, row.id);
    return c.body(null, 204);
  });

  return app;
}
