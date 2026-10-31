import { unlinkSync } from "node:fs";
import { join } from "node:path";
import {
  deleteEquipment,
  type EquipmentRow,
  getEquipment,
  type InterventionRow,
  insertEquipment,
  insertTask,
  listAttachmentsForEquipment,
  listEquipment,
  listInterventionsForEquipment,
  listTasksForEquipment,
  type TaskRow,
  updateEquipment,
} from "@maintenance-tracker/db";
import {
  computeTaskDue,
  type EquipmentCreate,
  equipmentCreateSchema,
  equipmentUpdateSchema,
  readingUpdateSchema,
  type TaskWithDue,
  taskCreateSchema,
} from "@maintenance-tracker/shared";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail, failValidation } from "../http/errors.ts";
import { uploadDocument } from "./attachments.ts";

/** Read a JSON body; null on malformed JSON (zod then rejects null). */
export async function readBody(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** The engine, projected over persisted rows — same function the client will use. */
export function taskWithDue(
  deps: AppDeps,
  eq: EquipmentRow,
  t: TaskRow,
  interventions: InterventionRow[],
): TaskWithDue {
  const due = computeTaskDue({
    task: {
      id: t.id,
      kind: t.kind === "expiry" ? "expiry" : "interval",
      monthsInterval: t.monthsInterval,
      meterInterval: t.meterInterval,
      currentExpiryDate: t.currentExpiryDate,
    },
    equipment: {
      meterKind: eq.meterKind as "none" | "hours" | "miles",
      reading: eq.reading,
      readingUpdatedAt: eq.readingUpdatedAt,
    },
    interventions: interventions.map((i) => ({
      id: i.id,
      taskId: i.taskId,
      equipmentId: i.equipmentId,
      date: i.date,
      meterAt: i.meterAt,
      expiryDate: i.expiryDate,
    })),
    nowMs: deps.clock(),
    tz: deps.tz,
  });
  return {
    id: t.id,
    equipmentId: t.equipmentId,
    name: t.name,
    description: t.description,
    kind: t.kind === "expiry" ? "expiry" : "interval",
    monthsInterval: t.monthsInterval,
    meterInterval: t.meterInterval,
    currentExpiryDate: t.currentExpiryDate,
    due,
  };
}

/**
 * Create an intervention on `eq` — implemented in interventions.ts and shared
 * with POST /api/equipment/:id/interventions.
 */
import { createInterventionForEquipment } from "./interventions.ts";

export function equipmentRoutes(deps: AppDeps) {
  const app = new Hono();
  const db = deps.db;

  app.get("/", (c) => c.json(listEquipment(db)));

  app.post("/", async (c) => {
    const parsed = equipmentCreateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);
    const data: EquipmentCreate = parsed.data;
    return c.json(insertEquipment(db, data), 201);
  });

  app.get("/:id", (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    return c.json(eq);
  });

  app.patch("/:id", async (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    const parsed = equipmentUpdateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);

    const { name, description, icon, meterKind } = parsed.data;
    const patch: Partial<Pick<EquipmentRow, "name" | "description" | "icon" | "meterKind">> = {};
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description ?? null;
    if (icon !== undefined) patch.icon = icon;
    if (meterKind !== undefined && meterKind !== eq.meterKind) {
      // §4: meter kind is immutable once readings exist.
      const hasReadings =
        eq.reading !== null ||
        listInterventionsForEquipment(db, eq.id).some((i) => i.meterAt !== null);
      if (hasReadings) {
        return fail(c, "meter_kind_immutable", 409, {
          message: "meter kind locked once readings exist",
        });
      }
      patch.meterKind = meterKind;
    }
    return c.json(updateEquipment(db, eq.id, patch) ?? eq);
  });

  app.delete("/:id", (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    // FK cascades drop attachment rows; the bytes are ours to sweep (§6.8)
    for (const a of listAttachmentsForEquipment(db, eq.id)) {
      try {
        unlinkSync(join(deps.filesDir, a.storedName));
      } catch {
        // already gone
      }
    }
    deleteEquipment(db, eq.id);
    return c.body(null, 204);
  });

  /** Upload a document (any sniffable MIME, stored under DATA_DIR/files). */
  app.post("/:id/documents", (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    return uploadDocument(deps, c, eq.id);
  });

  /** Explicit reading update — NEVER lowers silently (§2, §4). */
  app.post("/:id/reading", async (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    const parsed = readingUpdateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);

    if (eq.meterKind === "none") return fail(c, "meterless_equipment", 409);
    const regressed = eq.reading !== null && parsed.data.reading < eq.reading;
    if (regressed && parsed.data.correct !== true) {
      return fail(c, "meter_regressed", 409, {
        message: `reading cannot go below current ${eq.reading} without correct: true`,
      });
    }
    const updated = updateEquipment(db, eq.id, {
      reading: parsed.data.reading,
      readingUpdatedAt: parsed.data.date ?? deps.today(),
    });
    if (updated === null) return fail(c, "not_found", 404);
    return c.json(updated);
  });

  // ---- tasks nested under equipment ------------------------------------------

  app.get("/:id/tasks", (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    const interventions = listInterventionsForEquipment(db, eq.id);
    return c.json(
      listTasksForEquipment(db, eq.id).map((t) => taskWithDue(deps, eq, t, interventions)),
    );
  });

  app.post("/:id/tasks", async (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    const parsed = taskCreateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);

    if (parsed.data.meterInterval != null && eq.meterKind === "none") {
      return fail(c, "validation_failed", 400, {
        details: [{ path: "meterInterval", message: "equipment has no meter (meterless)" }],
      });
    }
    const row = insertTask(db, { ...parsed.data, equipmentId: eq.id });
    return c.json(taskWithDue(deps, eq, row, listInterventionsForEquipment(db, eq.id)), 201);
  });

  // ---- interventions nested under equipment -----------------------------------

  app.get("/:id/interventions", (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    return c.json(listInterventionsForEquipment(db, eq.id));
  });

  app.post("/:id/interventions", async (c) => {
    const eq = getEquipment(db, c.req.param("id"));
    if (!eq) return fail(c, "not_found", 404);
    return createInterventionForEquipment(deps, c, eq, await readBody(c));
  });

  return app;
}
