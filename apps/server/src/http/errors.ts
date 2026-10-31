import { type ErrorCode, errorEnvelope } from "@maintenance-tracker/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodError } from "zod";

/** Every API error flows through here — one envelope, machine-readable code. */
export function fail(
  c: Context,
  code: ErrorCode,
  status: ContentfulStatusCode,
  extra?: { message?: string; details?: { path: string; message: string }[] },
) {
  return c.json(errorEnvelope(code, extra), status);
}

export function zodDetails(err: ZodError): { path: string; message: string }[] {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function failValidation(c: Context, err: ZodError) {
  return fail(c, "validation_failed", 400, { details: zodDetails(err) });
}
