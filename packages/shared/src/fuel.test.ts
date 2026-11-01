import { describe, expect, test } from "bun:test";
import { computeFuelEconomy, type FuelSample } from "./fuel";

const s = (
	id: string,
	odometerMiles: number,
	gallons: number,
	priceCentsPerGallon: number | null = null,
): FuelSample => ({
	id,
	loggedAt: "2026-01-01",
	odometerTenths: Math.round(odometerMiles * 10),
	gallonsHundredths: Math.round(gallons * 100),
	pricePerGallonCents: priceCentsPerGallon,
});

describe("computeFuelEconomy", () => {
	test("empty log yields null everywhere", () => {
		const { entries, summary } = computeFuelEconomy([]);
		expect(entries).toEqual([]);
		expect(summary.logCount).toBe(0);
		expect(summary.distanceTenths).toBeNull();
		expect(summary.blendedMpgTenths).toBeNull();
		expect(summary.lastMpgTenths).toBeNull();
		expect(summary.totalCostCents).toBeNull();
	});

	test("single fill-up establishes the baseline odometer, no mpg", () => {
		const { entries, summary } = computeFuelEconomy([s("a", 1000, 10)]);
		expect(entries[0]?.mpgTenths).toBeNull();
		expect(entries[0]?.distanceTenths).toBeNull();
		expect(summary.distanceTenths).toBeNull();
	});

	test("exact arithmetic: 300 miles on 15 gallons = 20.0 mpg", () => {
		const { entries, summary } = computeFuelEconomy([s("a", 1000, 10), s("b", 1300, 15, 350)]);
		expect(entries[1]?.distanceTenths).toBe(3000);
		expect(entries[1]?.mpgTenths).toBe(200); // tenths
		expect(summary.blendedMpgTenths).toBe(200);
		expect(summary.lastMpgTenths).toBe(200);
		expect(summary.distanceTenths).toBe(3000);
		// gallons after the first fill-up only
		expect(summary.gallonsHundredths).toBe(1500);
		// 15 gal x $3.50 = $52.50
		expect(entries[1]?.totalCostCents).toBe(5250);
		expect(summary.totalCostCents).toBe(5250);
		expect(summary.avgPricePerGallonCents).toBe(350);
	});

	test("fractional mpg rounds to one decimal: 100 miles on 4.2 gal = 23.8", () => {
		const { entries } = computeFuelEconomy([s("a", 0, 1), s("b", 100, 4.2)]);
		// 1000 tenths-miles * 100 / 420 = 238.09… -> 238
		expect(entries[1]?.mpgTenths).toBe(238);
	});

	test("inputs out of odometer order are sorted, not assumed", () => {
		const { entries } = computeFuelEconomy([s("later", 1300, 15), s("earlier", 1000, 10)]);
		expect(entries[0]?.id).toBe("earlier");
		expect(entries[1]?.mpgTenths).toBe(200);
	});

	test("duplicate odometers produce no mpg for the second entry", () => {
		const { entries, summary } = computeFuelEconomy([s("a", 1000, 10), s("b", 1000, 8)]);
		expect(entries[1]?.mpgTenths).toBeNull();
		expect(entries[1]?.distanceTenths).toBeNull();
		expect(summary.distanceTenths).toBeNull();
		expect(summary.blendedMpgTenths).toBeNull();
	});

	test("three-fill blend uses total distance over post-first gallons", () => {
		// 1000 -> 1100 -> 1200 miles; intervals of 5 and 10 gallons.
		const { summary } = computeFuelEconomy([
			s("a", 1000, 9),
			s("b", 1100, 5, 300),
			s("c", 1200, 10, 400),
		]);
		// distance 200 mi, gallons after first 15 -> 13.3 mpg
		expect(summary.distanceTenths).toBe(2000);
		expect(summary.gallonsHundredths).toBe(1500);
		expect(summary.blendedMpgTenths).toBe(133);
		// last interval: 100 mi / 10 gal = 10.0
		expect(summary.lastMpgTenths).toBe(100);
		// cost 5*3.00 + 10*4.00 = $55.00; weighted price 5500/15 = 366.67 -> 367
		expect(summary.totalCostCents).toBe(5500);
		expect(summary.avgPricePerGallonCents).toBe(367);
	});

	test("mixed priced/unpriced: totals only cover priced fill-ups", () => {
		const { summary } = computeFuelEconomy([s("a", 0, 1), s("b", 100, 5), s("c", 200, 5, 300)]);
		expect(summary.totalCostCents).toBe(1500); // only the 5-gal @ $3.00
		expect(summary.avgPricePerGallonCents).toBe(300);
		expect(summary.blendedMpgTenths).toBe(200); // blend ignores pricing
	});

	test("a priced baseline counts toward cost totals", () => {
		const { summary } = computeFuelEconomy([s("a", 0, 10, 300), s("b", 100, 5)]);
		// 10 gal x $3.00 = $30.00 even though the baseline gallons are not
		// attributed to any distance.
		expect(summary.totalCostCents).toBe(3000);
		expect(summary.avgPricePerGallonCents).toBe(300);
	});
});

describe("fuel trend + best/worst", () => {
	// helper: intervals with given mpg values need Δ/gal pairs producing them
	test("fewer than 4 intervals: no trend, best/worst still shown", () => {
		const { summary } = computeFuelEconomy([
			s("a", 0, 1),
			s("b", 100, 5), // 20.0
			s("c", 200, 10), // 10.0
		]);
		expect(summary.trendComputable).toBe(false);
		expect(summary.trendDeltaTenths).toBeNull();
		expect(summary.bestMpg).toEqual({ mpgTenths: 200, loggedAt: "2026-01-01" });
		expect(summary.worstMpg).toEqual({ mpgTenths: 100, loggedAt: "2026-01-01" });
	});

	test("exactly 4 intervals: last 3 vs the single earlier one", () => {
		// mpg: 20.0, 16.7, 20.0, 14.3
		const { summary } = computeFuelEconomy([
			s("base", 0, 1),
			s("i1", 100, 5), // 200
			s("i2", 200, 6), // 167
			s("i3", 300, 5), // 200
			s("i4", 400, 7), // 143
		]);
		expect(summary.trendComputable).toBe(true);
		// recent avg (167+200+143)/3 = 170; earlier avg 200 -> -30
		expect(summary.trendDeltaTenths).toBe(-30);
		expect(summary.bestMpg?.mpgTenths).toBe(200); // first occurrence wins ties
		expect(summary.worstMpg?.mpgTenths).toBe(143);
	});

	test("steady MPG yields a zero (neutral) trend", () => {
		const { summary } = computeFuelEconomy([
			s("base", 0, 1),
			s("i1", 100, 5),
			s("i2", 200, 5),
			s("i3", 300, 5),
			s("i4", 400, 5),
		]);
		expect(summary.trendDeltaTenths).toBe(0);
	});

	test("improving trend is positive", () => {
		// mpg: 10.0 then 20.0 x3
		const { summary } = computeFuelEconomy([
			s("base", 0, 1),
			s("i1", 100, 10), // 100
			s("i2", 200, 5), // 200
			s("i3", 300, 5), // 200
			s("i4", 400, 5), // 200
		]);
		expect(summary.trendDeltaTenths).toBe(100);
	});

	test("non-computable intervals (duplicate odometers) are skipped", () => {
		const dup = s("dup", 100, 6, 300); // same odometer as i1 -> no distance
		dup.loggedAt = "2026-02-02";
		const { summary } = computeFuelEconomy([
			s("base", 0, 1),
			s("i1", 100, 5), // 200
			dup, // duplicate odometer -> no mpg
			s("i2", 200, 4), // 100 mi / 4 gal = 250
			s("i3", 300, 5), // 200
			s("i4", 400, 10), // 100
		]);
		// intervals: 200, 250, 200, 100 -> last 3 avg = 183, earlier = 200
		expect(summary.trendComputable).toBe(true);
		expect(summary.trendDeltaTenths).toBe(-17);
		expect(summary.bestMpg?.mpgTenths).toBe(250);
		expect(summary.worstMpg?.mpgTenths).toBe(100);
	});

	test("best/worst carry the fill-up date, null MPG entries ignored", () => {
		const best = s("best", 200, 2); // 100 mi / 2 gal = 50.0
		best.loggedAt = "2026-05-04";
		const { summary } = computeFuelEconomy([
			s("base", 0, 1),
			s("i1", 100, 5), // 20.0
			best,
			s("dup", 200, 4), // duplicate odometer -> no mpg
		]);
		expect(summary.bestMpg).toEqual({ mpgTenths: 500, loggedAt: "2026-05-04" });
		expect(summary.worstMpg).toEqual({ mpgTenths: 200, loggedAt: "2026-01-01" });
	});

	test("no MPG at all: best/worst null", () => {
		const { summary } = computeFuelEconomy([s("a", 1000, 10)]);
		expect(summary.bestMpg).toBeNull();
		expect(summary.worstMpg).toBeNull();
		expect(summary.trendComputable).toBe(false);
	});
});
