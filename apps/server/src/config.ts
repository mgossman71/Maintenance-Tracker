import { resolve } from "node:path";

export interface ServerConfig {
	port: number;
	bind: string;
	dataDir: string;
	trustProxy: boolean;
	sessionIdleDays: number;
	sessionAbsoluteDays: number;
	maxUploadBytes: number;
	timezone: string;
	webDist: string;
	secureCookies: boolean;
	version: string;
}

const int = (value: string | undefined, fallback: number): number => {
	if (value === undefined || value === "") return fallback;
	const n = Number.parseInt(value, 10);
	return Number.isFinite(n) ? n : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
	if (value === undefined || value === "") return fallback;
	return value === "1" || value === "true";
};

/** Validate and load configuration from environment (build-plan.md §10). */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
	const port = int(env.MT_PORT, 3000);
	if (port < 1 || port > 65535) throw new Error(`MT_PORT invalid: ${env.MT_PORT}`);
	const dataDir = env.MT_DATA_DIR ?? "./data";
	const config: ServerConfig = {
		port,
		bind: env.MT_BIND ?? "127.0.0.1",
		dataDir,
		trustProxy: bool(env.MT_TRUST_PROXY, false),
		sessionIdleDays: int(env.MT_SESSION_IDLE_DAYS, 30),
		sessionAbsoluteDays: int(env.MT_SESSION_MAX_DAYS, 180),
		maxUploadBytes: int(env.MT_MAX_UPLOAD_MB, 10) * 1024 * 1024,
		timezone: env.TZ ?? "America/Chicago",
		webDist: env.MT_WEB_DIST ?? resolve(import.meta.dirname, "../../web/dist"),
		secureCookies: bool(env.MT_SECURE_COOKIES, true),
		version: env.MT_VERSION ?? "0.3.0",
	};
	if (config.sessionIdleDays < 1) throw new Error("MT_SESSION_IDLE_DAYS must be >= 1");
	if (config.sessionAbsoluteDays < config.sessionIdleDays) {
		throw new Error("MT_SESSION_MAX_DAYS must be >= MT_SESSION_IDLE_DAYS");
	}
	if (config.maxUploadBytes < 1024) throw new Error("MT_MAX_UPLOAD_MB must be >= 1");
	return config;
}
