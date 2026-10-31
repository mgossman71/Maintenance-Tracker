import type { SessionRow } from "@maintenance-tracker/db";
import { MT_SESSION_COOKIE, MT_SESSION_COOKIE_DEV } from "@maintenance-tracker/shared";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { loadSession, type SessionConfig } from "../auth/sessions.ts";
import { fail } from "../http/errors.ts";

/** §6.3: SameSite=Strict + Origin verification on every mutating request. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfProtection(_opts: { trustProxy: boolean }): MiddlewareHandler {
  return async (c, next) => {
    if (!MUTATING.has(c.req.method)) return next();

    const host = c.req.header("host") ?? new URL(c.req.url).host;
    const origin = c.req.header("origin");

    if (origin !== undefined) {
      // Cross-site pages always send a foreign Origin; the scheme is NOT the
      // discriminator here (TLS/HSTS is, §6.6), the host is.
      const ok = origin === `http://${host}` || origin === `https://${host}`;
      if (!ok) return fail(c, "csrf_failed", 403);
      return next();
    }

    // No Origin (curl, server-to-server): fine ONLY if it carries no session
    // cookie. A cookie-carrying state change with no Origin is a classic
    // no-preflight cross-site POST.
    const cookie = c.req.header("cookie");
    if (
      cookie?.includes(`${MT_SESSION_COOKIE}=`) ||
      cookie?.includes(`${MT_SESSION_COOKIE_DEV}=`)
    ) {
      return fail(c, "csrf_failed", 403);
    }
    return next();
  };
}

/** §6.5: everything under /api requires a live session except the public set. */
export const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/auth/status",
  "/api/auth/login",
  "/api/auth/setup",
]);

export function requireSession(deps: {
  db: Parameters<typeof loadSession>[0];
  session: SessionConfig;
  clock: () => number;
}): MiddlewareHandler {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (PUBLIC_API_PATHS.has(path)) return next();

    const id = getCookie(
      c,
      deps.session.insecureCookies ? MT_SESSION_COOKIE_DEV : MT_SESSION_COOKIE,
    );
    if (!id) return fail(c, "session_required", 401);

    const row = loadSession(deps.db, id, deps.session, deps.clock());
    if (row === null) return fail(c, "session_required", 401);

    c.set("session", row satisfies SessionRow);
    return next();
  };
}

/**
 * §6.7 — the header set every response carries, SPA and API alike.
 *
 * CSP: scripts are same-origin ONLY (the build has no inline scripts —
 * verified against dist/index.html in M9). style-src allows 'unsafe-inline'
 * because React legitimately sets style ATTRIBUTES; that permits styling,
 * not script execution. frame-ancestors 'none' + X-Frame-Options: DENY is
 * belt-and-braces for older proxies. HSTS deliberately NOT here — TLS and
 * HSTS belong to the reverse proxy (§6.6).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    // after next() — the headers ride on whatever response the route produced
    c.res.headers.set("content-security-policy", CSP);
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("referrer-policy", "same-origin");
    c.res.headers.set("x-frame-options", "DENY");
    c.res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  };
}

/** Client IP for rate limiting — X-Forwarded-For trusted ONLY when told to (§6.4). */
export function clientIp(
  c: { req: { header: (n: string) => string | undefined }; env?: unknown },
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
  }
  const env = c.env as { info?: { remoteAddress?: string } } | undefined;
  return env?.info?.remoteAddress ?? "unknown";
}
