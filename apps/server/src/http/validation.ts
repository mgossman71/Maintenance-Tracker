import type { ZodType } from "zod";
import { ApiError } from "../util";

/** Validate with field-level error extraction (build-plan.md §7 error shape). */
export function parse<T>(schema: ZodType<T, unknown>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		const fields: Record<string, string> = {};
		for (const issue of result.error.issues) {
			const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
			if (!fields[key]) fields[key] = issue.message;
		}
		throw new ApiError(422, "validation", "Invalid request body", fields);
	}
	return result.data;
}
