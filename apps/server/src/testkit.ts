import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppDatabase } from "@mt/db";
import { createAppDatabase, openDatabase, runMigrations, seedBuiltinPresets } from "@mt/db";
import { createApp } from "./app";
import { resetRateLimits } from "./auth/ratelimit";
import { loadConfig, type ServerConfig } from "./config";

/** In-process app: no sockets, no startup races. Fresh DB per test file group. */

export interface TestApp {
	request: (
		method: string,
		path: string,
		body?: unknown,
		opts?: RequestOpts,
	) => Promise<TestResponse>;
	/** Multipart upload helper (no content-type set; fetch adds the boundary). */
	requestForm: (
		method: string,
		path: string,
		form: FormData,
		opts?: RequestOpts,
	) => Promise<TestResponse>;
	db: AppDatabase;
	config: ServerConfig;
	tempDir: string;
	login: () => Promise<void>;
	setup: (password?: string) => Promise<void>;
}

interface RequestOpts {
	anon?: boolean;
	origin?: string | null;
	secFetchSite?: string;
	headers?: Record<string, string>;
}

interface TestResponse {
	status: number;
	data: any;
	headers: Headers;
}

export function createTestApp(env: Record<string, string> = {}): TestApp {
	const raw = openDatabase(":memory:");
	const db = createAppDatabase(raw);
	runMigrations(db);
	seedBuiltinPresets(db);
	const tempDir = mkdtempSync(join(tmpdir(), "mt-test-"));
	const config = loadConfig({
		MT_SECURE_COOKIES: "0",
		MT_DATA_DIR: tempDir,
		TZ: "America/Chicago",
		...env,
	});
	const app = createApp({ db, config });
	let cookie: string | null = null;

	const send = async (
		method: string,
		path: string,
		body: BodyInit | undefined,
		headers: Record<string, string>,
		opts: RequestOpts,
	): Promise<TestResponse> => {
		const res = await app.fetch(new Request(`http://localhost${path}`, { method, headers, body }));
		const setCookie = res.headers.get("set-cookie");
		if (setCookie && !opts.anon) cookie = setCookie.split(";")[0] ?? null;
		let data: unknown = null;
		try {
			data = await res.json();
		} catch {
			/* non-json */
		}
		return { status: res.status, data, headers: res.headers };
	};

	const instance: TestApp = {
		db,
		config,
		tempDir,
		async request(method, path, body, opts = {}) {
			const headers: Record<string, string> = { ...opts.headers };
			if (body !== undefined) headers["content-type"] = "application/json";
			if (cookie && !opts.anon) headers.cookie = cookie;
			if (opts.origin === null) {
				/* omit */
			} else if (opts.origin !== undefined) {
				headers.origin = opts.origin;
			} else if (method !== "GET") {
				headers.origin = "http://localhost"; // same-origin default
			}
			if (opts.secFetchSite) headers["sec-fetch-site"] = opts.secFetchSite;
			return send(
				method,
				path,
				body === undefined ? undefined : JSON.stringify(body),
				headers,
				opts,
			);
		},
		async requestForm(method, path, form, opts = {}) {
			const headers: Record<string, string> = { ...opts.headers };
			if (cookie && !opts.anon) headers.cookie = cookie;
			if (opts.origin === null) {
				/* omit */
			} else if (opts.origin !== undefined) {
				headers.origin = opts.origin;
			} else if (method !== "GET") {
				headers.origin = "http://localhost";
			}
			return send(method, path, form, headers, opts);
		},
		async setup(password = "correct-horse-battery") {
			const res = await instance.request("POST", "/api/setup", { password });
			expect(res.status).toBe(201);
		},
		async login(password = "correct-horse-battery") {
			const res = await instance.request("POST", "/api/login", { password });
			expect(res.status).toBe(200);
		},
	};
	return instance;
}

export { resetRateLimits };

let current: TestApp | null = null;

export function useApp(): TestApp {
	if (!current) throw new Error("call setupApp() first");
	return current;
}

export function setupApp(env?: Record<string, string>): void {
	beforeEach(() => {
		resetRateLimits();
		current = createTestApp(env);
	});
	afterEach(() => {
		if (current) rmSync(current.tempDir, { recursive: true, force: true });
		current = null;
	});
}

export const T = (units: number) => Math.round(units * 10);

export async function createTruck(t: TestApp, miles = 12000): Promise<string> {
	const r = await t.request("POST", "/api/equipment", {
		name: "F-150",
		hasMiles: true,
		currentMiles: T(miles),
	});
	expect(r.status).toBe(201);
	return r.data.id as string;
}

export async function createTask(
	t: TestApp,
	equipmentId: string,
	overrides: Record<string, unknown> = {},
): Promise<string> {
	const r = await t.request("POST", `/api/equipment/${equipmentId}/tasks`, {
		name: "Oil Change",
		milesEnabled: true,
		milesInterval: T(5000),
		calendarEnabled: false,
		...overrides,
	});
	expect(r.status).toBe(201);
	return r.data.id as string;
}

export async function taskStatus(t: TestApp, equipmentId: string, index = 0) {
	const r = await t.request("GET", `/api/equipment/${equipmentId}/tasks`);
	return (r.data as Array<{ task: any; status: any }>)[index]!;
}

export { describe, expect, test };
