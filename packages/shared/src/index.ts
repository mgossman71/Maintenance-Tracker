import { z } from "zod";

export * from "./date.ts";
export * from "./domain.ts";
export * from "./engine.ts";

/**
 * Response contract for GET /api/health.
 *
 * Strict + non-passthrough on purpose: /health is one of the few public
 * routes and must never leak version, config, or anything else
 * (build-plan.md §6.5). Parsing with strict() is the executable statement
 * of that rule — if someone adds a field, this schema test fails.
 */
export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
