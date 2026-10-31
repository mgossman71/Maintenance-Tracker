import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildTestApp, errorOf, PASSWORD, type TestApp } from "./testkit.ts";

describe("auth: setup, login, sessions, logout", () => {
  let t: TestApp;
  beforeAll(() => {
    t = buildTestApp();
  });
  afterAll(() => t.close());

  test("status reports setup=false before first run", async () => {
    const res = await t.call("/api/auth/status");
    expect(res.status).toBe(200); // public
    expect(await res.json()).toEqual({ setupComplete: false });
  });

  test("login before setup fails with the ONE generic error", async () => {
    const res = await t.login("anything");
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_credentials");
  });

  test("setup rejects a weak master password with details", async () => {
    const res = await t.setup("short");
    expect(res.status).toBe(400);
    const err = await errorOf(res);
    expect(err.code).toBe("validation_failed");
    expect(err.details?.[0]?.path).toBe("password");
  });

  test("setup succeeds, auto-logs-in, status flips", async () => {
    const res = await t.setup();
    expect(res.status).toBe(201);
    expect(t.cookieValue()).toStartWith("");
    const session = await t.call("/api/auth/session", { auth: true });
    expect(session.status).toBe(200);
    const status = await t.call("/api/auth/status");
    expect(await status.json()).toEqual({ setupComplete: true });
  });

  test("setup is single-shot", async () => {
    const res = await t.setup("another-master-password");
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("setup_complete");
  });

  test("wrong password → generic invalid_credentials, no cookie", async () => {
    const before = t.cookieValue();
    const res = await t.login("wrong-password-xx");
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("invalid_credentials");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(t.cookieValue()).toBe(before);
  });

  test("session info requires a session", async () => {
    const res = await t.call("/api/auth/session");
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("session_required");
  });

  test("login regenerates the session id (old cookie dies)", async () => {
    const oldCookie = t.cookieValue();
    // a real browser carries the old cookie on the login request — so must we
    const res = await t.call("/api/auth/login", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    expect(t.cookieValue()).not.toBe(oldCookie);
    // old id must now be unknown:
    const stale = await t.call("/api/auth/session", {
      headers: { cookie: `mt_session_dev=${oldCookie}` },
    });
    expect(stale.status).toBe(401);
  });

  test("idle expiry: session dies after the idle window, absent activity", async () => {
    await t.setupAndLogin(); // fresh app state would be cleaner, but logout+login resets here
    const session = await t.call("/api/auth/session", { auth: true });
    expect(session.status).toBe(200);
    t.clock.advance(31 * 86_400_000); // 31 days > 30 day idle window
    const dead = await t.call("/api/auth/session", { auth: true });
    expect(dead.status).toBe(401);
    // …and the row is gone from the store — cannot be revived by rewinding
    t.clock.advance(-32 * 86_400_000);
    const revived = await t.call("/api/auth/session", { auth: true });
    expect(revived.status).toBe(401);
  });

  test("absolute cap kills an actively-used session", async () => {
    // rebuild to reset clock-side expiry state cleanly
    t.close();
    t = buildTestApp();
    await t.setupAndLogin();

    // Touch the session every 12 h (well inside the 30-day idle window) for
    // 95 days; the 90-day absolute cap must be what kills it.
    let diedAfterDays = -1;
    for (let half = 0; half < 190; half++) {
      t.clock.advance(43_200_000);
      const status = (await t.call("/api/auth/session", { auth: true })).status;
      if (status === 401) {
        diedAfterDays = (half + 1) * 0.5;
        break;
      }
    }
    expect(diedAfterDays).toBeGreaterThanOrEqual(89.5);
    expect(diedAfterDays).toBeLessThanOrEqual(90.5);
  });

  test("logout revokes ALL sessions", async () => {
    await t.setupAndLogin();
    const second = await t.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    const secondCookie = second.headers.get("set-cookie")?.match(/mt_session_dev=([^;]+)/)?.[1];
    expect(secondCookie).toBeDefined();

    const out = await t.call("/api/auth/logout", { method: "POST", auth: true });
    expect(out.status).toBe(204);
    const firstAfter = await t.call("/api/auth/session", { auth: true });
    const secondAfter = await t.call("/api/auth/session", {
      headers: { cookie: `mt_session_dev=${secondCookie}` },
    });
    expect(firstAfter.status).toBe(401);
    expect(secondAfter.status).toBe(401);
  });

  test("password change verifies current, revokes all sessions, new password works", async () => {
    await t.setupAndLogin();
    const wrong = await t.call("/api/auth/password", {
      method: "POST",
      auth: true,
      body: JSON.stringify({
        currentPassword: "nope-nope-nope",
        newPassword: "brand-new-master-pw",
      }),
    });
    expect(wrong.status).toBe(401);

    const ok = await t.call("/api/auth/password", {
      method: "POST",
      auth: true,
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "brand-new-master-pw" }),
    });
    expect(ok.status).toBe(204);

    const dead = await t.call("/api/auth/session", { auth: true });
    expect(dead.status).toBe(401);

    expect((await t.login(PASSWORD)).status).toBe(401); // old password gone
    const fresh = await buildTestApp(); // separate guard state, untouched
    fresh.close();
    const relogin = await t.login("brand-new-master-pw");
    expect(relogin.status).toBe(200);
  });
});

describe("cookie attributes (§6.2/§6.6)", () => {
  test("secure mode: __Host- prefix with HttpOnly/Secure/SameSite=Strict/Path=/", async () => {
    const t = buildTestApp({ insecureCookies: false });
    await t.setup();
    const res = await t.login();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toInclude("__Host-mt_session=");
    expect(setCookie).toInclude("HttpOnly");
    expect(setCookie).toInclude("Secure");
    expect(setCookie).toInclude("SameSite=Strict");
    expect(setCookie).toInclude("Path=/");
    t.close();
  });

  test("dev mode (MT_INSECURE_COOKIES): no Secure, dev cookie name", async () => {
    const t = buildTestApp({ insecureCookies: true });
    await t.setup();
    const res = await t.login();
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toInclude("mt_session_dev=");
    expect(setCookie).not.toInclude("Secure");
    expect(setCookie).toInclude("HttpOnly"); // still
    t.close();
  });
});

describe("login guard: rate limit + exponential lockout (§6.4)", () => {
  test("5 consecutive failures → lockout with Retry-After; doubling per failure", async () => {
    const t = buildTestApp();
    await t.setup();
    for (let i = 0; i < 5; i++) {
      const res = await t.login("wrong-password-xx");
      if (i < 4) expect(res.status).toBe(401);
      else {
        expect(res.status).toBe(429);
        expect((await errorOf(res)).code).toBe("locked");
        expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
      }
    }
    const locked = await t.login("anything-at-all");
    expect(locked.status).toBe(429);
    expect((await errorOf(locked)).code).toBe("locked");

    // wait out the first lockout (30s base) — 6th failure doubles it
    t.clock.advance(31_000);
    const sixth = await t.login("wrong-password-xx");
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(30);

    // correct password during a lockout still cannot pass
    const duringLock = await t.login(PASSWORD);
    expect(duringLock.status).toBe(429);
    t.close();
  });

  test("success resets the failure streak", async () => {
    const t = buildTestApp();
    await t.setup();
    for (let i = 0; i < 4; i++) await t.login("wrong-password-xx");
    expect((await t.login()).status).toBe(200); // reset
    for (let i = 0; i < 4; i++) {
      expect((await t.login("wrong-password-xx")).status).toBe(401); // would be lockout at 5+4
    }
    t.close();
  });

  test("limits are per-IP", async () => {
    const t = buildTestApp();
    await t.setup();
    for (let i = 0; i < 5; i++) await t.login("wrong-password-xx", "198.51.100.1");
    expect((await t.login("wrong-password-xx", "198.51.100.1")).status).toBe(429); // locked
    expect((await t.login("wrong-password-xx", "198.51.100.2")).status).toBe(401); // free
    t.close();
  });

  test("X-Forwarded-For trusted ONLY when MT_TRUST_PROXY=1 (§6.4)", async () => {
    // trustProxy OFF: XFF spoofing cannot escape the lockout
    const direct = buildTestApp({ trustProxy: false });
    await direct.setup();
    for (let i = 0; i < 5; i++) {
      await direct.call("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong-password-xx" }),
        headers: { "x-forwarded-for": `5.5.5.${i}` },
        ip: "198.51.100.9",
      });
    }
    const spoofed = await direct.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password-xx" }),
      headers: { "x-forwarded-for": "6.6.6.6" },
      ip: "198.51.100.9",
    });
    expect(spoofed.status).toBe(429); // all XFF values collapse to the real socket IP
    direct.close();

    // trustProxy ON: XFF is the key — distinct clients separate, same client follows
    const proxied = buildTestApp({ trustProxy: true });
    await proxied.setup();
    for (let i = 0; i < 5; i++) {
      await proxied.call("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: "wrong-password-xx" }),
        headers: { "x-forwarded-for": "5.5.5.5" },
        ip: "198.51.100.9",
      });
    }
    const sameClient = await proxied.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "anything" }),
      headers: { "x-forwarded-for": "5.5.5.5" },
      ip: "198.51.100.9",
    });
    expect(sameClient.status).toBe(429);
    const differentClient = await proxied.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "anything" }),
      headers: { "x-forwarded-for": "7.7.7.7" },
      ip: "198.51.100.9",
    });
    expect(differentClient.status).toBe(401);
    proxied.close();
  });
});
