/** Small shared server utilities. */

export function nowIso(): string {
	return new Date().toISOString();
}

export function uuid(): string {
	return crypto.randomUUID();
}

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly fields?: Record<string, string>,
	) {
		super(message);
	}
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, fields?: Record<string, string>) =>
	new ApiError(400, "bad_request", message, fields);
export const conflict = (message: string) => new ApiError(409, "conflict", message);
export const forbidden = (message = "Forbidden") => new ApiError(403, "forbidden", message);
export const unauthorized = (message = "Authentication required") =>
	new ApiError(401, "unauthorized", message);
