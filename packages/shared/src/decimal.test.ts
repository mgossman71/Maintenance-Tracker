import { describe, expect, test } from "bun:test";
import { formatMeter, parseMeterToTenths } from "./decimal";

describe("parseMeterToTenths", () => {
	test("parses integers and one-decimal values to tenths", () => {
		expect(parseMeterToTenths("10000")).toBe(100_000);
		expect(parseMeterToTenths("127.5")).toBe(1275);
		expect(parseMeterToTenths(127.5)).toBe(1275);
		expect(parseMeterToTenths(0)).toBe(0);
		expect(parseMeterToTenths("0.1")).toBe(1);
	});

	test("rejects more than one decimal place and garbage", () => {
		expect(parseMeterToTenths("127.45")).toBeNull();
		expect(parseMeterToTenths(127.45)).toBeNull();
		expect(parseMeterToTenths("abc")).toBeNull();
		expect(parseMeterToTenths("")).toBeNull();
		expect(parseMeterToTenths("1e3")).toBeNull();
	});

	test("round-trips decimals exactly", () => {
		for (const v of ["0", "0.5", "12.3", "127.5", "99999.9"]) {
			const tenths = parseMeterToTenths(v);
			expect(tenths).not.toBeNull();
			expect(formatMeter(tenths as number)).toBe(v.replace(/\.0$/, ""));
		}
	});
});

describe("formatMeter", () => {
	test("trims trailing zero decimals", () => {
		expect(formatMeter(1275)).toBe("127.5");
		expect(formatMeter(1200)).toBe("120");
		expect(formatMeter(1)).toBe("0.1");
	});
});
