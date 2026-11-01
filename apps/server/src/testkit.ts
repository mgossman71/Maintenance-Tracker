import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
	db: AppDatabase;
	config: ServerConfig;
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

export function createTestApp(): TestApp {
	const raw = openDatabase(":memory:");
	const db = createAppDatabase(raw);
	runMigrations(db);
	seedBuiltinPresets(db);
	const config = loadConfig({
		MT_SECURE_COOKIES: "0",
		MT_DATA_DIR: "/tmp/mt-test-unused",
		TZ: "America/Chicago",
	});
	const app = createApp({ db, config });
	let cookie: string | null = null;

	const instance: TestApp = {
		db,
		config,
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
			const res = await app.fetch(
				new Request(`http://localhost${path}`, {
					method,
					headers,
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);
			const setCookie = res.headers.get("set-cookie");
			if (setCookie && !opts.anon) cookie = setCookie.split(";")[0] ?? null;
			let data: unknown = null;
			try {
				data = await res.json();
			} catch {
				/* non-json */
			}
			return { status: res.status, data, headers: res.headers };
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

export function setupApp(): void {
	beforeEach(() => {
		resetRateLimits();
		current = createTestApp();
	});
	afterEach(() => {
		current = null;
	});
}

export const T = (units: number) => Math.round(units * 10);

export async function createTruck(t: TestApp, miles = 12000): Promise<string> {
	const r = await t.request("POST", "/api/equipment", {
		name: "F-150",
		meterKind: "miles",
		currentMeter: T(miles),
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
		meterEnabled: true,
		meterInterval: T(5000),
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
