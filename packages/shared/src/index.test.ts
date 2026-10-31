import { describe, expect, test } from "bun:test";
import { healthResponseSchema } from "./index.ts";

describe("healthResponseSchema", () => {
  test("accepts the minimal ok payload", () => {
    expect(healthResponseSchema.parse({ status: "ok" })).toEqual({ status: "ok" });
  });

  test("rejects payloads that leak extra fields (§6.5 no version/config leak)", () => {
    expect(healthResponseSchema.safeParse({ status: "ok", version: "1.2.3" }).success).toBe(false);
    expect(
      healthResponseSchema.safeParse({ status: "ok", config: { bind: "0.0.0.0" } }).success,
    ).toBe(false);
  });

  test("rejects anything else", () => {
    expect(healthResponseSchema.safeParse({ status: "degraded" }).success).toBe(false);
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });
});
