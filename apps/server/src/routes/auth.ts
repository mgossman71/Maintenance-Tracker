import type { AppDatabase } from "@mt/db";
import { loginInput, passwordChangeInput, type SessionDto, setupInput } from "@mt/shared";
import type { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { changePassword, checkLogin, completeSetup, isSetupComplete } from "../auth/password";
import { clientKey, isBlocked, recordFailure, recordSuccess } from "../auth/ratelimit";
import {
	createSession,
	revokeAllSessions,
	revokeSession,
	sessionCookieName,
} from "../auth/sessions";
import type { ServerConfig } from "../config";
import { parse } from "../http/validation";
import type { AppVariables } from "../types";
import { ApiError, unauthorized } from "../util";

export function registerAuthRoutes(
	app: Hono<AppVariables>,
	db: AppDatabase,
	config: ServerConfig,
): void {
	const cookieOpts = {
		httpOnly: true,
		secure: config.secureCookies,
		sameSite: "Strict" as const,
		path: "/",
		maxAge: config.sessionAbsoluteDays * 86_400,
	};

	app.post("/api/setup", async (c) => {
		if (await isSetupComplete(db)) {
			throw new ApiError(409, "already_configured", "Setup has already been completed");
		}
		const { password } = parse(setupInput, await c.req.json().catch(() => null));
		const done = await completeSetup(db, password);
		if (!done) throw new ApiError(409, "already_configured", "Setup has already been completed");
		const { token } = createSession(db, config);
		setCookie(c, sessionCookieName(config), token, cookieOpts);
		return c.json({ ok: true }, 201);
	});

	app.post("/api/login", async (c) => {
		const ip = config.trustProxy
			? (c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
				c.req.header("x-real-ip") ??
				"unknown")
			: "direct";
		const key = clientKey(ip);
		const block = isBlocked(key);
		if (block.blocked) {
			throw new ApiError(
				429,
				"rate_limited",
				`Too many failed attempts. Retry in ${block.retryAfterSeconds}s.`,
			);
		}
		if (!(await isSetupComplete(db))) {
			throw new ApiError(404, "not_configured", "Application setup has not been completed yet.");
		}
		const { password } = parse(loginInput, await c.req.json().catch(() => null));
		if (!(await checkLogin(db, password))) {
			recordFailure(key);
			// Generic message: never reveal whether setup/password differs.
			throw unauthorized("Invalid password");
		}
		recordSuccess(key);
		const { token } = createSession(db, config);
		setCookie(c, sessionCookieName(config), token, cookieOpts);
		return c.json({ ok: true });
	});

	app.post("/api/logout", (c) => {
		const session = c.get("session");
		if (session) revokeSession(db, session.id);
		deleteCookie(c, sessionCookieName(config), { path: "/" });
		return c.json({ ok: true });
	});

	app.get("/api/session", async (c) => {
		const setupComplete = await isSetupComplete(db);
		const session = c.get("session");
		const body: SessionDto = { authenticated: Boolean(session), setupComplete };
		return c.json(body);
	});

	app.post("/api/password/change", async (c) => {
		const input = parse(passwordChangeInput, await c.req.json().catch(() => null));
		await changePassword(db, input.currentPassword, input.newPassword);
		// Password change revokes every session (including this one).
		revokeAllSessions(db);
		deleteCookie(c, sessionCookieName(config), { path: "/" });
		return c.json({ ok: true, message: "Password changed. All sessions revoked; log in again." });
	});
}
