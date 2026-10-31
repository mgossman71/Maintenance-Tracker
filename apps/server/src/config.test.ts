import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  test("defaults match build-plan.md §5", () => {
    const config = loadConfig({});
    expect(config.port).toBe(8787);
    expect(config.bind).toBe("127.0.0.1"); // loopback by default — proxy is the front door
    expect(config.dataDir).toBe("data");
    expect(config.trustProxy).toBe(false);
    expect(config.dbPath).toBe("data/mt.db");
  });

  test("trust proxy only with explicit 1", () => {
    expect(loadConfig({ MT_TRUST_PROXY: "1" }).trustProxy).toBe(true);
    expect(loadConfig({ MT_TRUST_PROXY: "0" }).trustProxy).toBe(false);
  });

  test("rejects nonsense values", () => {
    expect(() => loadConfig({ MT_PORT: "0" })).toThrow(ZodError);
    expect(() => loadConfig({ MT_PORT: "70000" })).toThrow(ZodError);
    expect(() => loadConfig({ MT_PORT: "not-a-port" })).toThrow(ZodError);
    expect(() => loadConfig({ MT_TRUST_PROXY: "maybe" })).toThrow(ZodError);
  });

  test("dbPath follows MT_DATA_DIR, trailing slash tolerated", () => {
    expect(loadConfig({ MT_DATA_DIR: "/srv/mt" }).dbPath).toBe("/srv/mt/mt.db");
    expect(loadConfig({ MT_DATA_DIR: "/srv/mt/" }).dbPath).toBe("/srv/mt/mt.db");
  });

  test("webDir defaults under the repo, overridable via MT_WEB_DIR", () => {
    expect(loadConfig({}).webDir).toEndWith("/apps/web/dist");
    expect(loadConfig({ MT_WEB_DIR: "/tmp/web" }).webDir).toBe("/tmp/web");
  });
});
