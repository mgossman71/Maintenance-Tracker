import {
  deleteTaskPreset,
  getTaskPreset,
  insertTaskPreset,
  listTaskPresets,
  updateTaskPreset,
} from "@maintenance-tracker/db";
import { taskPresetCreateSchema, taskPresetUpdateSchema } from "@maintenance-tracker/shared";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail, failValidation } from "../http/errors.ts";
import { readBody } from "./equipment.ts";

/**
 * The task library (§2): editable presets the "Add task" picker offers,
 * seeded with car/boat/home starters on first run (seedTaskPresetsIfEmpty).
 */
export function presetsRoutes(deps: AppDeps) {
  const app = new Hono();
  const db = deps.db;

  app.get("/", (c) => c.json(listTaskPresets(db)));

  app.post("/", async (c) => {
    const parsed = taskPresetCreateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);
    return c.json(insertTaskPreset(db, parsed.data), 201);
  });

  app.patch("/:id", async (c) => {
    const preset = getTaskPreset(db, c.req.param("id"));
    if (!preset) return fail(c, "not_found", 404);
    const parsed = taskPresetUpdateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);
    const updated = updateTaskPreset(db, preset.id, parsed.data);
    if (updated === null) return fail(c, "not_found", 404);
    return c.json(updated);
  });

  app.delete("/:id", (c) => {
    const preset = getTaskPreset(db, c.req.param("id"));
    if (!preset) return fail(c, "not_found", 404);
    deleteTaskPreset(db, preset.id);
    return c.body(null, 204);
  });

  return app;
}
