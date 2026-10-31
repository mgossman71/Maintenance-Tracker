import { randomBytes } from "node:crypto";
import {
  type DatabaseHandle,
  deleteSession,
  insertSession,
  type SessionRow,
  selectSession,
  touchSession,
} from "@maintenance-tracker/db";
import { MT_SESSION_COOKIE, MT_SESSION_COOKIE_DEV } from "@maintenance-tracker/shared";

/**
 * Server-side session store (§6.2): the DB is the source of truth so
 * logout / password change can revoke; the cookie holds only the id.
 */

export interface SessionConfig {
  idleMs: number;
  absoluteMs: number;
  /** true → plain-name cookie without __Host-/Secure (local dev over http). */
  insecureCookies: boolean;
}

/** 256 bits of entropy, base64url — §4: id (random 256-bit). */
export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function createSession(
  db: DatabaseHandle["db"],
  cfg: SessionConfig,
  nowMs: number,
): SessionRow {
  const row: SessionRow = {
    id: newSessionId(),
    createdAt: new Date(nowMs).toISOString(),
    lastSeenAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + cfg.idleMs).toISOString(),
  };
  insertSession(db, row);
  return row;
}

/**
 * Validate + slide the idle window. Expired (idle OR absolute) sessions are
 * deleted on sight — the store cannot resurrect them.
 */
export function loadSession(
  db: DatabaseHandle["db"],
  id: string,
  cfg: SessionConfig,
  nowMs: number,
): SessionRow | null {
  const row = selectSession(db, id);
  if (row === null) return null;

  const idleExpired = nowMs > Date.parse(row.expiresAt);
  const absoluteExpired = nowMs > Date.parse(row.createdAt) + cfg.absoluteMs;
  if (idleExpired || absoluteExpired) {
    deleteSession(db, id);
    return null;
  }

  const lastSeenMs = Date.parse(row.lastSeenAt);
  if (nowMs - lastSeenMs > 60_000) {
    // slide the idle window (max one write per minute)
    const lastSeenAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + cfg.idleMs).toISOString();
    touchSession(db, id, lastSeenAt, expiresAt);
    return { ...row, lastSeenAt, expiresAt };
  }
  return row;
}

export function sessionCookieName(cfg: SessionConfig): string {
  return cfg.insecureCookies ? MT_SESSION_COOKIE_DEV : MT_SESSION_COOKIE;
}

export function sessionCookieOptions(cfg: SessionConfig, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: !cfg.insecureCookies,
    sameSite: "Strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
