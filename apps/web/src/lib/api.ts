export class ApiClientError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly fields?: Record<string, string>,
	) {
		super(message);
	}
}

/** 401 anywhere (expired/revoked session) tells the app to show the login gate. */
const UNAUTHORIZED_EVENT = "mt:unauthorized";
export function onUnauthorized(listener: () => void): () => void {
	const handler = () => listener();
	window.addEventListener(UNAUTHORIZED_EVENT, handler);
	return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method,
		headers: body !== undefined ? { "content-type": "application/json" } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
		credentials: "same-origin",
	});
	if (
		res.status === 401 &&
		path !== "/api/session" &&
		path !== "/api/login" &&
		path !== "/api/setup"
	) {
		window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
	}
	if (res.status === 404 && path.startsWith("/api/")) {
		throw new ApiClientError(404, "not_found", "Not found");
	}
	let data: unknown = null;
	try {
		data = await res.json();
	} catch {
		/* empty */
	}
	if (!res.ok) {
		const err = (
			data as { error?: { code?: string; message?: string; fields?: Record<string, string> } }
		)?.error;
		throw new ApiClientError(
			res.status,
			err?.code ?? "error",
			err?.message ?? `Request failed (${res.status})`,
			err?.fields,
		);
	}
	return data as T;
}

export const api = {
	get: <T>(path: string) => request<T>("GET", path),
	post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
	patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
	delete: <T>(path: string) => request<T>("DELETE", path),
	upload: async <T>(path: string, file: File): Promise<T> => {
		const form = new FormData();
		form.append("file", file);
		const res = await fetch(path, { method: "POST", body: form, credentials: "same-origin" });
		if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
		let data: unknown = null;
		try {
			data = await res.json();
		} catch {
			/* empty */
		}
		if (!res.ok) {
			const err = (data as { error?: { code?: string; message?: string } })?.error;
			throw new ApiClientError(res.status, err?.code ?? "error", err?.message ?? "Upload failed");
		}
		return data as T;
	},
};
