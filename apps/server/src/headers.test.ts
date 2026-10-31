import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./app.ts";
import { CSP } from "./http/middleware.ts";
import { buildTestApp, type TestApp } from "./testkit.ts";

/**
 * §6.7 acceptance: every response the app produces carries the security
 * header set — SPA document, assets, API (authed and not), errors, 404s.
 */

const REQUIRED: [string, string][] = [
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "same-origin"],
  ["x-frame-options", "DENY"],
];

function expectHeaders(res: Response) {
  for (const [name, value] of REQUIRED) expect(res.headers.get(name)).toBe(value);
  const csp = res.headers.get("content-security-policy") ?? "";
  expect(csp).toBe(CSP);
}

describe("security headers (§6.7)", () => {
  let t: TestApp;
  let webDir: string;

  beforeAll(async () => {
    t = buildTestApp();
    webDir = mkdtempSync(join(tmpdir(), "mt-web-"));
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>t</title>");
    await t.setupAndLogin();
  });
  afterAll(() => {
    t.close();
    rmSync(webDir, { recursive: true, force: true });
  });

  test("unauthenticated API responses carry the set, and no-store", async () => {
    const res = await t.call("/api/dashboard");
    expect(res.status).toBe(401);
    expectHeaders(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("authenticated API responses carry the set", async () => {
    const res = await t.call("/api/dashboard", { auth: true });
    expect(res.status).toBe(200);
    expectHeaders(res);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("health is contentless but never headerless", async () => {
    const res = await t.call("/api/health");
    expectHeaders(res);
    expect(await res.json()).toEqual({ status: "ok" }); // never version/config (§6.5)
  });

  test("404s and malformed paths carry the set too", async () => {
    expectHeaders(await t.call("/api/nope"));
    expectHeaders(await t.call("/no-such-page"));
  });

  test("SPA documents served by the app carry the set too", async () => {
    const spa = createApp({ webDir });
    const res = await spa.request("/");
    expect(res.status).toBe(200);
    expectHeaders(res);
  });

  test("the CSP is the tight one: no unsafe-eval, no wildcard, no inline scripts", () => {
    expect(CSP).not.toContain("unsafe-eval");
    expect(CSP).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(CSP).not.toContain("*");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("base-uri 'none'");
  });
});
