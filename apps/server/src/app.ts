import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { AppDatabase } from "@mt/db";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getSession, sessionCookieName, touchSession } from "./auth/sessions";
import type { ServerConfig } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerEquipmentRoutes } from "./routes/equipment";
import { registerEventRoutes } from "./routes/events";
import { registerFileRoutes } from "./routes/files";
import { registerFuelRoutes } from "./routes/fuel";
import { registerMiscRoutes } from "./routes/misc";
import { registerTaskRoutes } from "./routes/tasks";
import type { AppVariables } from "./types";
import { ApiError, forbidden, unauthorized } from "./util";

export interface AppContext {
	db: AppDatabase;
	config: ServerConfig;
}

const PUBLIC_API = new Set(["/api/setup", "/api/login", "/api/session"]);

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".json": "application/json",
	".map": "application/json",
	".txt": "text/plain; charset=utf-8",
};

export function createApp({ db, config }: AppContext): Hono<AppVariables> {
	const app = new Hono<AppVariables>();

	// --- Error handling: structured shape, no internals leaked -------------
	app.onError((err, c) => {
		if (err instanceof ApiError) {
			return c.json(
				{
					error: {
						code: err.code,
						message: err.message,
						...(err.fields ? { fields: err.fields } : {}),
					},
				},
				err.status as ContentfulStatusCode,
			);
		}
		console.error(
			`[error] ${c.req.method} ${c.req.path}:`,
			err instanceof Error ? err.message : err,
		);
		return c.json({ error: { code: "internal", message: "Internal server error" } }, 500);
	});

	// --- Security headers ----------------------------------------------------
	app.use("*", async (c, next) => {
		await next();
		const h = c.res.headers;
		h.set(
			"Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
		);
		h.set("X-Content-Type-Options", "nosniff");
		h.set("X-Frame-Options", "DENY");
		h.set("Referrer-Policy", "no-referrer");
		h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
		if (c.req.path.startsWith("/api/")) h.set("Cache-Control", "private, no-store");
	});

	// --- Session resolution (optional; guard decides necessity) --------------
	app.use("*", async (c, next) => {
		const token = getCookie(c, sessionCookieName(config));
		if (token) {
			const session = getSession(db, config, token);
			if (session) {
				c.set("session", session);
				touchSession(db, session.id);
			}
		}
		await next();
	});

	// --- CSRF: verify Origin on state-changing API requests ------------------
	// Same-origin fetch sends Origin; reject any that is not ours. Behind a
	// TLS-terminating proxy the scheme legitimately differs, so require a
	// host match there and strict full-origin match when bound directly.
	app.use("/api/*", async (c, next) => {
		if (["POST", "PATCH", "PUT", "DELETE"].includes(c.req.method)) {
			const origin = c.req.header("origin");
			if (origin) {
				let originUrl: URL | null = null;
				try {
					originUrl = new URL(origin);
				} catch {
					originUrl = null;
				}
				const requestUrl = new URL(c.req.url);
				const hostMatches = originUrl?.hostname === requestUrl.hostname;
				const fullMatch = hostMatches && originUrl?.origin === requestUrl.origin;
				if (!originUrl || !(fullMatch || (config.trustProxy && hostMatches))) {
					throw forbidden("Cross-origin request rejected");
				}
			} else {
				const fetchSite = c.req.header("sec-fetch-site");
				if (fetchSite === "cross-site") throw forbidden("Cross-site request rejected");
			}
		}
		await next();
	});

	// --- Auth guard: every data endpoint requires a session ------------------
	app.use("/api/*", async (c, next) => {
		if (!PUBLIC_API.has(c.req.path) && !c.get("session")) throw unauthorized();
		await next();
	});

	registerAuthRoutes(app, db, config);
	registerEquipmentRoutes(app, db, config);
	registerTaskRoutes(app, db, config);
	registerEventRoutes(app, db, config);
	registerMiscRoutes(app, db, config);
	registerFileRoutes(app, db, config);
	registerFuelRoutes(app, db, config);

	// --- Health: unauthenticated, no sensitive content -----------------------
	app.get("/health", (c) => c.json({ status: "ok", version: config.version }));

	// --- Static SPA with client-routing fallback ------------------------------
	const webDist = resolve(config.webDist);
	const serveStaticFile = (file: string, cache: string): Response => {
		const body = readFileSync(file);
		return new Response(body, {
			headers: {
				"Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
				"Cache-Control": cache,
			},
		});
	};

	app.get("*", (c) => {
		const path = c.req.path;
		if (path.startsWith("/api/")) {
			return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
		}
		const indexPath = join(webDist, "index.html");
		if (path !== "/" && !path.startsWith("/assets/")) {
			// SPA routes: everything non-asset renders the app shell.
			if (isFile(indexPath)) return serveStaticFile(indexPath, "no-cache");
			return fallbackMessage(c, config);
		}
		const target = resolve(join(webDist, path));
		if (!target.startsWith(webDist + sep) && target !== webDist) {
			return c.json({ error: { code: "forbidden", message: "Forbidden" } }, 403);
		}
		if (isFile(target)) {
			const cache = path.startsWith("/assets/")
				? "public, max-age=31536000, immutable"
				: "no-cache";
			return serveStaticFile(target, cache);
		}
		if (isFile(indexPath)) return serveStaticFile(indexPath, "no-cache");
		return fallbackMessage(c, config);
	});

	return app;
}

function isFile(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isFile();
	} catch {
		return false;
	}
}

function fallbackMessage(c: Context, config: ServerConfig) {
	return c.text(
		`Maintenance Tracker v${config.version} API is running. The web frontend has not been built yet (expected at ${config.webDist}). Run: bun run build`,
		404,
	);
}
