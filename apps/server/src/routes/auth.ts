import type { SessionRow } from "@maintenance-tracker/db";
import {
  type DatabaseHandle,
  deleteAllSessions,
  deleteSession,
  getSetting,
  setSetting,
} from "@maintenance-tracker/db";
import {
  type AuthStatus,
  authStatusSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  setupRequestSchema,
} from "@maintenance-tracker/shared";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import type { LoginGuard } from "../auth/ratelimit.ts";
import type { SessionConfig } from "../auth/sessions.ts";
import { createSession, sessionCookieName, sessionCookieOptions } from "../auth/sessions.ts";
import { fail } from "../http/errors.ts";
import { clientIp } from "../http/middleware.ts";

export const PASSWORD_HASH_KEY = "auth.password_hash";

export interface AuthDeps {
  db: DatabaseHandle["db"];
  session: SessionConfig;
  guard: LoginGuard;
  trustProxy: boolean;
  clock: () => number;
}

/** One generic failure string regardless of state (§6.4). */
const INVALID = { code: "invalid_credentials" as const, message: "Invalid password" };

/** Cache a dummy hash so login-before-setup costs the same as a real verify. */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("timing-equalization-throwaway");
  return dummyHashPromise;
}

function sessionInfo(row: SessionRow) {
  return { createdAt: row.createdAt, expiresAt: row.expiresAt, lastSeenAt: row.lastSeenAt };
}

export function authRoutes(deps: AuthDeps) {
  const app = new Hono<{ Variables: { session: SessionRow } }>();
  const currentHash = () => getSetting(deps.db, PASSWORD_HASH_KEY);

  app.get("/status", (c) => {
    const status: AuthStatus = { setupComplete: currentHash() !== null };
    return c.json(authStatusSchema.parse(status));
  });

  app.post("/setup", async (c) => {
    if (currentHash() !== null) return fail(c, "setup_complete", 403);
    const body = await c.req.json().catch(() => null);
    const parsed = setupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, "validation_failed", 400, {
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    setSetting(deps.db, PASSWORD_HASH_KEY, await hashPassword(parsed.data.password));
    // Auto-login after setup so the user never gets locked out of their own first screen.
    const row = createSession(deps.db, deps.session, deps.clock());
    setCookie(
      c,
      sessionCookieName(deps.session),
      row.id,
      sessionCookieOptions(deps.session, deps.session.idleMs / 1000),
    );
    return c.json(sessionInfo(row), 201);
  });

  app.post("/login", async (c) => {
    const ip = clientIp(c, deps.trustProxy);
    const decision = deps.guard.pre(ip);
    if (!decision.allowed) {
      c.header("Retry-After", String(Math.ceil(decision.retryAfterMs / 1000)));
      return fail(c, decision.code, 429);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = loginRequestSchema.safeParse(body);
    if (!parsed.success) return fail(c, INVALID.code, 401, { message: INVALID.message });

    deps.guard.recordAttempt(ip);
    const stored = currentHash();
    let ok = false;
    if (stored === null) {
      // Burn the same work as a real verify, then fail identically (§6.4).
      await verifyPassword(parsed.data.password, await dummyHash());
    } else {
      ok = await verifyPassword(parsed.data.password, stored);
    }

    if (!ok) {
      const lockMs = deps.guard.recordFailure(ip);
      if (lockMs !== null) {
        // The failure that arms a lockout answers 429 right away.
        c.header("Retry-After", String(Math.ceil(lockMs / 1000)));
        return fail(c, "locked", 429);
      }
      return fail(c, INVALID.code, 401, { message: INVALID.message });
    }

    // Session-id regeneration on privilege change: drop the old cookie's session.
    // (The gate skips /login, so read the cookie manually here.)
    const oldId = c.req.header("cookie")?.match(/(?:__Host-)?mt_session(?:_dev)?=([^;]+)/)?.[1];
    if (oldId) deleteSession(deps.db, oldId);

    const row = createSession(deps.db, deps.session, deps.clock());
    setCookie(
      c,
      sessionCookieName(deps.session),
      row.id,
      sessionCookieOptions(deps.session, deps.session.idleMs / 1000),
    );
    deps.guard.recordSuccess(ip);
    return c.json(sessionInfo(row));
  });

  app.post("/logout", (c) => {
    deleteAllSessions(deps.db); // §6.2: logout revokes ALL sessions
    deleteCookie(c, sessionCookieName(deps.session), { path: "/" });
    return c.body(null, 204);
  });

  app.get("/session", (c) => c.json(sessionInfo(c.get("session") as SessionRow)));

  app.post("/password", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = changePasswordRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, "validation_failed", 400, {
        details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const stored = currentHash();
    if (stored === null || !(await verifyPassword(parsed.data.currentPassword, stored))) {
      return fail(c, INVALID.code, 401, { message: INVALID.message });
    }
    setSetting(deps.db, PASSWORD_HASH_KEY, await hashPassword(parsed.data.newPassword));
    deleteAllSessions(deps.db); // §6.2: password change revokes ALL sessions
    deleteCookie(c, sessionCookieName(deps.session), { path: "/" });
    return c.body(null, 204);
  });

  return app;
}
