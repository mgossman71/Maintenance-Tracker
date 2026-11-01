import { createHash } from "node:crypto";
import type { AppDatabase } from "@mt/db";
import { sessions } from "@mt/db";
import { eq } from "drizzle-orm";
import type { ServerConfig } from "../config";
import { nowIso, uuid } from "../util";

/**
 * Opaque server-side sessions. The cookie carries a high-entropy random token;
 * only its SHA-256 hash is stored. Idle timeout plus absolute lifespan; all
 * sessions are revoked on logout-all and password change.
 */

const SESSION_COOKIE = "__Host-mt_session";
const DEV_COOKIE = "mt_session_dev";

export function sessionCookieName(config: ServerConfig): string {
	return config.secureCookies ? SESSION_COOKIE : DEV_COOKIE;
}

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function daysFromNow(days: number): string {
	return new Date(Date.now() + days * 86_400_000).toISOString();
}

export interface SessionInfo {
	id: string;
	expiresAt: string;
}

export function createSession(
	db: AppDatabase,
	config: ServerConfig,
): { token: string; id: string } {
	const tokenBytes = new Uint8Array(32);
	crypto.getRandomValues(tokenBytes);
	const token = btoa(String.fromCodePoint(...tokenBytes))
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
	const id = uuid();
	const now = nowIso();
	db.insert(sessions)
		.values({
			id,
			tokenHash: hashToken(token),
			createdAt: now,
			lastSeenAt: now,
			expiresAt: daysFromNow(config.sessionAbsoluteDays),
		})
		.run();
	return { token, id };
}

export function getSession(
	db: AppDatabase,
	config: ServerConfig,
	token: string,
): SessionInfo | null {
	const row = db
		.select()
		.from(sessions)
		.where(eq(sessions.tokenHash, hashToken(token)))
		.get();
	if (!row) return null;
	const now = Date.now();
	const idleCutoff = now - config.sessionIdleDays * 86_400_000;
	if (new Date(row.expiresAt).getTime() < now || new Date(row.lastSeenAt).getTime() < idleCutoff) {
		db.delete(sessions).where(eq(sessions.id, row.id)).run();
		return null;
	}
	return { id: row.id, expiresAt: row.expiresAt };
}

/** Throttled idle touch so every request doesn't write to SQLite. */
const lastTouch = new Map<string, number>();
export function touchSession(db: AppDatabase, sessionId: string): void {
	const now = Date.now();
	const previous = lastTouch.get(sessionId) ?? 0;
	if (now - previous < 60_000) return;
	lastTouch.set(sessionId, now);
	db.update(sessions)
		.set({ lastSeenAt: new Date().toISOString() })
		.where(eq(sessions.id, sessionId))
		.run();
}

export function revokeSession(db: AppDatabase, sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

/** Revokes every session (password change, admin reset). */
export function revokeAllSessions(db: AppDatabase): void {
	db.delete(sessions).run();
}

/** Housekeeping: drop expired/idle-out sessions at startup. */
export function pruneSessions(db: AppDatabase, config: ServerConfig): void {
	const now = Date.now();
	const all = db
		.select({ id: sessions.id, expiresAt: sessions.expiresAt, lastSeenAt: sessions.lastSeenAt })
		.from(sessions)
		.all();
	for (const s of all) {
		if (
			new Date(s.expiresAt).getTime() < now ||
			new Date(s.lastSeenAt).getTime() < now - config.sessionIdleDays * 86_400_000
		) {
			db.delete(sessions).where(eq(sessions.id, s.id)).run();
		}
	}
}
