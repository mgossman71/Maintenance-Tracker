import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { buildTestApp, errorOf, PASSWORD, type TestApp } from "./testkit.ts";

/**
 * §10: every route has an "unauthenticated request gets 401" test — from M2
 * onward this table MUST include every data route (§9: no unauthenticated
 * data route ships in any milestone after this one).
 */
const DATA_ROUTES: [string, string, string?][] = [
  ["GET", "/api/equipment"],
  ["POST", "/api/equipment", '{"name":"x"}'],
  ["GET", "/api/equipment/whatever"],
  ["PATCH", "/api/equipment/whatever", '{"name":"x"}'],
  ["DELETE", "/api/equipment/whatever"],
  ["POST", "/api/equipment/whatever/reading", '{"reading":1}'],
  ["GET", "/api/equipment/whatever/tasks"],
  ["POST", "/api/equipment/whatever/tasks", '{"name":"x","kind":"expiry"}'],
  ["GET", "/api/equipment/whatever/interventions"],
  ["POST", "/api/equipment/whatever/interventions", '{"label":"x","date":"2026-01-01"}'],
  ["GET", "/api/tasks/whatever"],
  ["PATCH", "/api/tasks/whatever", '{"name":"x"}'],
  ["DELETE", "/api/tasks/whatever"],
  ["GET", "/api/presets"],
  ["POST", "/api/presets", '{"name":"x"}'],
  ["PATCH", "/api/presets/whatever", '{"name":"x"}'],
  ["DELETE", "/api/presets/whatever"],
  ["POST", "/api/equipment/whatever/documents", "----x"],
  ["POST", "/api/interventions/whatever/photos", "----x"],
  ["GET", "/api/attachments/whatever"],
  ["GET", "/api/attachments/equipment/whatever"],
  ["DELETE", "/api/attachments/whatever"],
  ["GET", "/api/dashboard"],
  ["GET", "/api/interventions/whatever"],
  ["PATCH", "/api/interventions/whatever", '{"date":"2026-01-01"}'],
  ["DELETE", "/api/interventions/whatever"],
  ["GET", "/api/auth/session"],
  ["POST", "/api/auth/logout"],
  ["POST", "/api/auth/password", '{"currentPassword":"aa","newPassword":"bbbbbbbbbbbbbb"}'],
];

describe("auth gate: every data route 401s unauthenticated (§10)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setup(); // with setup done, a 401 can only come from the gate
  });
  afterAll(() => t.close());

  for (const [method, path, body] of DATA_ROUTES) {
    test(`${method} ${path} → 401 session_required`, async () => {
      const res = await t.call(path, { method, body });
      expect(res.status).toBe(401);
      expect((await errorOf(res)).code).toBe("session_required");
    });
  }

  test("unknown /api/* path is gated too — route existence never leaks unauthenticated", async () => {
    const res = await t.call("/api/definitely-not-here");
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe("session_required");
  });

  test("but the genuinely public routes stay open", async () => {
    expect((await t.call("/api/health")).status).toBe(200);
    expect((await t.call("/api/auth/status")).status).toBe(200);
    const login = await t.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password-xx" }),
    });
    expect(login.status).toBe(401);
    expect((await errorOf(login)).code).toBe("invalid_credentials"); // NOT session_required
  });
});

describe("CSRF: Origin verification on mutating requests (§6.3)", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  const HOST = "localhost:8787";

  test("cross-site Origin on an authenticated mutation → 403 csrf_failed", async () => {
    const res = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      origin: "https://evil.example",
      body: JSON.stringify({ name: "sneaky" }),
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("csrf_failed");
  });

  test("same-origin mutation passes", async () => {
    const res = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      origin: `http://${HOST}`,
      body: JSON.stringify({ name: "fine" }),
    });
    expect(res.status).toBe(201);
  });

  test("cookie-carrying mutation with NO Origin → 403 (no-preflight POST)", async () => {
    const res = await t.call("/api/equipment", {
      method: "POST",
      auth: true,
      noOrigin: true,
      body: JSON.stringify({ name: "formpost" }),
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("csrf_failed");
  });

  test("mutation with no Origin and no cookie (curl / server-to-server) is allowed by CSRF", async () => {
    // reaches the gate and 401s there — CSRF is not what blocks it
    const res = await t.call("/api/equipment", {
      method: "POST",
      body: JSON.stringify({ name: "curl" }),
    });
    expect(res.status).toBe(401);
  });

  test("GET is never blocked by CSRF (wrong origin is harmless, gate decides)", async () => {
    const res = await t.call("/api/equipment", { origin: "https://evil.example" });
    expect(res.status).toBe(401); // no auth → gate; CSRF passed through
  });

  test("login POST is CSRF-checked too (every mutating request)", async () => {
    const res = await t.call("/api/auth/login", {
      method: "POST",
      origin: "https://evil.example",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe("csrf_failed");
  });
});
