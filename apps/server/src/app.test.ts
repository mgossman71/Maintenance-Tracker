import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthResponseSchema } from "@maintenance-tracker/shared";
import { createApp } from "./app.ts";

describe("GET /api/health", () => {
  const app = createApp();

  test("200, minimal payload matching the shared schema", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(healthResponseSchema.parse(body)).toEqual({ status: "ok" });
  });

  test("no-store on API responses (§6.7)", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("unknown API route → JSON error envelope, not the SPA shell", async () => {
    const res = await app.request("/api/definitely-not-here");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toInclude("application/json");
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("not_found");
  });
});

describe("static SPA serving", () => {
  let dir: string;
  let secretPath: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "mt-static-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Maintenance-Tracker</title>");
    writeFileSync(join(dir, "assets", "app.js"), "console.log(1);");
    // something sensitive OUTSIDE the web root that must never be served
    secretPath = join(dir, "..", "secret-do-not-serve.txt");
    writeFileSync(secretPath, "TOP-SECRET");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(secretPath, { force: true });
  });

  test("serves index.html at /", async () => {
    const app = createApp({ webDir: dir });
    const res = await app.request("/");
    expect(res.status).toBe(200);
    // the shell must revalidate — a heuristically cached shell resurrects
    // an old build after every deploy (the "I don't see the update" bug)
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toInclude("Maintenance-Tracker");
  });

  test("serves hashed assets with real content, not the shell", async () => {
    const app = createApp({ webDir: dir });
    const res = await app.request("/assets/app.js");
    expect(res.status).toBe(200);
    // content-hashed names → safe to cache forever
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toBe("console.log(1);");
  });

  test("client-side routes fall back to the SPA shell", async () => {
    const app = createApp({ webDir: dir });
    const res = await app.request("/equipment/abc/tasks");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache"); // the shell, again
    expect(await res.text()).toInclude("Maintenance-Tracker");
  });

  test("path traversal cannot escape the web root", async () => {
    const app = createApp({ webDir: dir });
    for (const probe of [
      "/../secret-do-not-serve.txt",
      "/%2e%2e/secret-do-not-serve.txt",
      "/%2e%2e%2fsecret-do-not-serve.txt",
      "/..%2fsecret-do-not-serve.txt",
    ]) {
      const res = await app.request(probe);
      expect(await res.text()).toInclude("Maintenance-Tracker"); // shell, never the secret
    }
  });

  test("without a web build, unknown paths 404 instead of exploding", async () => {
    const empty = mkdtempSync(join(tmpdir(), "mt-empty-"));
    try {
      const app = createApp({ webDir: empty });
      const res = await app.request("/anything");
      expect(res.status).toBe(404);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
