import { deleteTask, getTask, updateTask } from "@maintenance-tracker/db";
import { taskUpdateSchema } from "@maintenance-tracker/shared";
import { Hono } from "hono";
import type { AppDeps } from "../app.ts";
import { fail, failValidation } from "../http/errors.ts";
import { readBody } from "./equipment.ts";

/**
 * PATCH/DELETE /api/tasks/:id — kind is fixed at creation (§4), so updates
 * re-validate the RESULT: an interval task must keep ≥1 component and an
 * expiry task must never gain intervals.
 */
export function tasksRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/:id", (c) => {
    const row = getTask(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    return c.json(row);
  });

  app.patch("/:id", async (c) => {
    const row = getTask(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    const parsed = taskUpdateSchema.safeParse(await readBody(c));
    if (!parsed.success) return failValidation(c, parsed.error);

    const months =
      parsed.data.monthsInterval !== undefined ? parsed.data.monthsInterval : row.monthsInterval;
    const meter =
      parsed.data.meterInterval !== undefined ? parsed.data.meterInterval : row.meterInterval;

    if (row.kind === "interval" && months == null && meter == null) {
      return fail(c, "validation_failed", 400, {
        details: [
          { path: "monthsInterval", message: "interval tasks need at least one component" },
        ],
      });
    }
    if (row.kind === "expiry" && (months != null || meter != null)) {
      return fail(c, "validation_failed", 400, {
        details: [{ path: "kind", message: "expiry tasks carry no intervals" }],
      });
    }

    const updated = updateTask(deps.db, row.id, { ...parsed.data });
    return c.json(updated);
  });

  app.delete("/:id", (c) => {
    const row = getTask(deps.db, c.req.param("id"));
    if (!row) return fail(c, "not_found", 404);
    deleteTask(deps.db, row.id);
    return c.body(null, 204);
  });

  return app;
}
