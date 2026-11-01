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

/** One standout interval (best/worst) with the fill-up date it belongs to. */
export interface FuelMpgPoint {
	mpgTenths: number;
	loggedAt: string;
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
	/** Best single interval, tenths, with its date; null with no MPG yet. */
	bestMpg: FuelMpgPoint | null;
	/** Worst single interval, tenths, with its date; null with no MPG yet. */
	worstMpg: FuelMpgPoint | null;
	/**
	 * Trend: average MPG of the last 3 intervals minus the average of all
	 * earlier intervals. Needs 4+ computable intervals so the "earlier"
	 * baseline never contains the recent samples it is compared against.
	 */
	trendComputable: boolean;
	/** Signed MPG delta in tenths; null unless `trendComputable`. */
	trendDeltaTenths: number | null;
	/** Sum over priced fill-ups; null when nothing is priced. */
	totalCostCents: number | null;
	/** Volume-weighted average of priced fill-ups, cents per gallon. */
	avgPricePerGallonCents: number | null;
}

const TREND_RECENT_INTERVALS = 3;
const TREND_MIN_INTERVALS = 4;

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
	for (let i = 1; i < sorted.length; i++) {
		gallonsAfterFirst += (sorted[i] as FuelSample).gallonsHundredths;
	}
	// Cost, however, is money actually spent: every priced fill-up counts,
	// including a priced baseline.
	let pricedGallons = 0;
	let pricedCost = 0;
	for (const s of sorted) {
		if (s.pricePerGallonCents !== null && s.pricePerGallonCents > 0) {
			pricedGallons += s.gallonsHundredths;
			pricedCost += s.gallonsHundredths * s.pricePerGallonCents;
		}
	}
	const lastMpg = [...entries].reverse().find((e) => e.mpgTenths !== null)?.mpgTenths ?? null;

	// Best/worst intervals and trend all work on computable intervals only,
	// in odometer order (backfilled fill-ups slot in where they belong).
	const intervals = entries.filter((e) => e.mpgTenths !== null);
	let bestMpg: FuelMpgPoint | null = null;
	let worstMpg: FuelMpgPoint | null = null;
	for (const e of intervals) {
		const mpg = e.mpgTenths as number;
		if (!bestMpg || mpg > bestMpg.mpgTenths) bestMpg = { mpgTenths: mpg, loggedAt: e.loggedAt };
		if (!worstMpg || mpg < worstMpg.mpgTenths) worstMpg = { mpgTenths: mpg, loggedAt: e.loggedAt };
	}
	let trendDeltaTenths: number | null = null;
	const trendComputable = intervals.length >= TREND_MIN_INTERVALS;
	if (trendComputable) {
		const avg = (rows: FuelEconomyEntry[]) =>
			Math.round(rows.reduce((sum, e) => sum + (e.mpgTenths as number), 0) / rows.length);
		const recent = intervals.slice(-TREND_RECENT_INTERVALS);
		const earlier = intervals.slice(0, -TREND_RECENT_INTERVALS);
		trendDeltaTenths = avg(recent) - avg(earlier);
	}

	return {
		entries,
		summary: {
			logCount: entries.length,
			distanceTenths,
			gallonsHundredths: gallonsAfterFirst,
			blendedMpgTenths:
				distanceTenths !== null ? mpgTenths(distanceTenths, gallonsAfterFirst) : null,
			lastMpgTenths: lastMpg,
			bestMpg,
			worstMpg,
			trendComputable,
			trendDeltaTenths,
			totalCostCents: pricedGallons > 0 ? Math.round(pricedCost / 100) : null,
			avgPricePerGallonCents: pricedGallons > 0 ? Math.round(pricedCost / pricedGallons) : null,
		},
	};
}
