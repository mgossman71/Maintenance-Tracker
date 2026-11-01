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
});
