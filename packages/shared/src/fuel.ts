/**
 * Fuel economy engine — pure functions, integer arithmetic.
 *
 * MPG between two fill-ups is the distance driven divided by the fuel it
 * took: (odometer − previous odometer) / gallons. Everything stays integer:
 * odometers are tenths of miles, gallons are hundredths, MPG is reported in
 * tenths (205 = 20.5 mpg). No floats do interval math here.
 *
 * Samples that share an odometer or go backwards cannot produce a distance,
 * so their mpg is null — history is never dropped, just not interpolated.
 */

export interface FuelSample {
	id: string;
	loggedAt: string; // YYYY-MM-DD
	odometerTenths: number;
	gallonsHundredths: number;
	pricePerGallonCents: number | null;
}

export interface FuelEconomyEntry extends FuelSample {
	/** Distance driven since the previous fill-up, tenths of miles. */
	distanceTenths: number | null;
	/** MPG since the previous fill-up, integer tenths (205 = 20.5). */
	mpgTenths: number | null;
	/** pricePerGallon * gallons for this fill-up, cents; null if unpriced. */
	totalCostCents: number | null;
}

export interface FuelSummary {
	logCount: number;
	/** Odometer spread across all logs (max − min), tenths. */
	distanceTenths: number | null;
	/** Gallons for fill-ups after the first (the fuel the distance took). */
	gallonsHundredths: number;
	/** Blended MPG over the whole log, tenths; null when uncomputable. */
	blendedMpgTenths: number | null;
	/** MPG of the most recent computable interval, tenths. */
	lastMpgTenths: number | null;
	/** Sum over priced fill-ups; null when nothing is priced. */
	totalCostCents: number | null;
	/** Volume-weighted average of priced fill-ups, cents per gallon. */
	avgPricePerGallonCents: number | null;
}

/** mpg in tenths: miles = Δtenths/10, gallons = G/100 → mpg = 10·Δ/G. */
function mpgTenths(distanceTenths: number, gallonsHundredths: number): number | null {
	if (distanceTenths <= 0 || gallonsHundredths <= 0) return null;
	return Math.round((distanceTenths * 100) / gallonsHundredths);
}

export function computeFuelEconomy(samples: FuelSample[]): {
	entries: FuelEconomyEntry[];
	summary: FuelSummary;
} {
	const sorted = [...samples].sort((a, b) => a.odometerTenths - b.odometerTenths);
	const entries: FuelEconomyEntry[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const sample = sorted[i] as FuelSample;
		const prev = i > 0 ? (sorted[i - 1] as FuelSample) : null;
		const rawDistance = prev ? sample.odometerTenths - prev.odometerTenths : 0;
		const distance = prev && rawDistance > 0 ? rawDistance : null;
		const totalCostCents =
			sample.pricePerGallonCents !== null && sample.pricePerGallonCents > 0
				? Math.round((sample.gallonsHundredths * sample.pricePerGallonCents) / 100)
				: null;
		entries.push({
			...sample,
			distanceTenths: distance,
			mpgTenths: distance !== null ? mpgTenths(distance, sample.gallonsHundredths) : null,
			totalCostCents,
		});
	}

	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	const distanceTenths =
		first && last && last.odometerTenths - first.odometerTenths > 0
			? last.odometerTenths - first.odometerTenths
			: null;

	// Blended MPG attributes only the gallons poured *after* the first log —
	// the first fill-up establishes the starting odometer, not consumption.
	let gallonsAfterFirst = 0;
	let pricedGallons = 0;
	let pricedCost = 0;
	for (let i = 1; i < sorted.length; i++) {
		const s = sorted[i] as FuelSample;
		gallonsAfterFirst += s.gallonsHundredths;
		if (s.pricePerGallonCents !== null && s.pricePerGallonCents > 0) {
			pricedGallons += s.gallonsHundredths;
			pricedCost += s.gallonsHundredths * s.pricePerGallonCents;
		}
	}
	const lastMpg = [...entries].reverse().find((e) => e.mpgTenths !== null)?.mpgTenths ?? null;

	return {
		entries,
		summary: {
			logCount: entries.length,
			distanceTenths,
			gallonsHundredths: gallonsAfterFirst,
			blendedMpgTenths:
				distanceTenths !== null ? mpgTenths(distanceTenths, gallonsAfterFirst) : null,
			lastMpgTenths: lastMpg,
			totalCostCents: pricedGallons > 0 ? Math.round(pricedCost / 100) : null,
			avgPricePerGallonCents: pricedGallons > 0 ? Math.round(pricedCost / pricedGallons) : null,
		},
	};
}
