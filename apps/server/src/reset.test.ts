import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getSetting } from "@maintenance-tracker/db";
import { parseResetArgv, resetMasterPassword } from "./reset.ts";
import { PASSWORD_HASH_KEY } from "./routes/auth.ts";
import { buildTestApp, PASSWORD, type TestApp } from "./testkit.ts";

describe("--reset-password CLI (§6.1)", () => {
  test("argv parsing: flag, optional value, help", () => {
    expect(parseResetArgv([])).toEqual({ reset: false, password: undefined, help: false });
    expect(parseResetArgv(["--reset-password"])).toMatchObject({
      reset: true,
      password: undefined,
    });
    expect(parseResetArgv(["--reset-password", "a-strong-new-pass-1"])).toMatchObject({
      reset: true,
      password: "a-strong-new-pass-1",
    });
    // a following flag is NOT the password
    expect(parseResetArgv(["--reset-password", "--help"])).toMatchObject({
      reset: true,
      password: undefined,
      help: true,
    });
  });

  let t: TestApp;
  beforeAll(async () => {
    t = buildTestApp();
    await t.setupAndLogin();
  });
  afterAll(() => t.close());

  test("reset rewrites the hash, revokes sessions, and swaps the password", async () => {
    const oldCookie = t.cookieValue();
    const oldHash = getSetting(t.handle.db, PASSWORD_HASH_KEY);
    expect(oldHash).not.toBeNull();

    const NEXT = "the-recovered-master-key";
    await resetMasterPassword(t.handle.db, NEXT);

    // the hash actually changed, and every session is gone
    expect(getSetting(t.handle.db, PASSWORD_HASH_KEY)).not.toBe(oldHash);
    expect((await t.call("/api/dashboard", { auth: true })).status).toBe(401);
    void oldCookie;

    // the OLD password is dead; the NEW one works
    const bad = await t.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(bad.status).toBe(401);
    const good = await t.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: NEXT }),
    });
    expect(good.status).toBe(200);
  });

  test("the SAME 12-character policy as setup — weak resets are refused", async () => {
    await expect(resetMasterPassword(t.handle.db, "shortie")).rejects.toThrow(/12 characters/);
    // untouched: the working password from the previous test still works
    const res = await t.call("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "the-recovered-master-key" }),
    });
    expect(res.status).toBe(200);
  });
});
