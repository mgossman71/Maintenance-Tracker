import { unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  backfillTaskMeterBaselines,
  deleteIntervention,
  type EquipmentRow,
  getEquipment,
  getIntervention,
  getTask,
  insertIntervention,
  listAttachmentsForIntervention,
  recalcMeterFromInterventions,
  recalcTaskExpiry,
  updateEquipment,
  updateIntervention,
  updateTask,
} from "@maintenance-tracker/db";
import { interventionCreateSchema, interventionUpdateSchema } from "@maintenance-tracker/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail, failValidation } from "../http/errors.ts";
import { uploadPhoto } from "./attachments.ts";
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
    // other unserviced meter tasks start counting from this point too
    backfillTaskMeterBaselines(deps.db, eq.id, d.meterAt);
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

    // Invariant: a stored meterAt may never sit below the current reading —
    // UNLESS this very row is the reading's source (meterAt == current):
    // correcting that recorded work IS how a wrong meter gets fixed, and the
    // cascade below re-derives the reading from the remaining history.
    const eq = getEquipment(deps.db, row.equipmentId);
    const isReadingSource =
      eq !== null && row.meterAt !== null && eq.reading !== null && eq.reading === row.meterAt;
    if (parsed.data.meterAt != null && !isReadingSource) {
      if (eq !== null && eq.reading !== null && parsed.data.meterAt < eq.reading) {
        return fail(c, "meter_regressed", 409, {
          message: `meterAt cannot go below current reading ${eq.reading}`,
        });
      }
    }
    const updated = updateIntervention(deps.db, row.id, parsed.data);

    // ---- cascades (§2: the meter and expiry dates follow the history) ----
    if (parsed.data.meterAt !== undefined && row.meterAt !== parsed.data.meterAt) {
      if (eq != null && eq.reading === row.meterAt) {
        // this row WAS the meter's source — re-derive from remaining work
        recalcMeterFromInterventions(deps.db, row.equipmentId);
      }
    }
    if (parsed.data.expiryDate !== undefined && row.expiryDate !== parsed.data.expiryDate) {
      const task = row.taskId != null ? getTask(deps.db, row.taskId) : null;
      if (task != null && task.kind === "expiry") recalcTaskExpiry(deps.db, task.id);
    }
    return c.json(updated);
  });

  /** Photos: images only, sniffed (§6.8). Attach after creating the work. */
  app.post("/:id/photos", async (c) => {
    const row = getIntervention(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    return uploadPhoto(deps, c, row);
  });

  app.delete("/:id", (c) => {
    const row = getIntervention(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    const eq = getEquipment(deps.db, row.equipmentId);

    // photo bytes are ours to sweep (FK cascades only the rows)
    for (const a of listAttachmentsForIntervention(deps.db, row.id)) {
      try {
        unlinkSync(join(deps.filesDir, a.storedName));
      } catch {
        // already gone
      }
    }
    deleteIntervention(deps.db, row.id);

    // ---- cascades ----
    if (row.meterAt != null && eq != null && eq.reading === row.meterAt) {
      recalcMeterFromInterventions(deps.db, row.equipmentId);
    }
    if (row.taskId != null && row.expiryDate != null) {
      const task = getTask(deps.db, row.taskId);
      if (task != null && task.kind === "expiry") recalcTaskExpiry(deps.db, row.taskId);
    }
    return c.body(null, 204);
  });

  return app;
}
