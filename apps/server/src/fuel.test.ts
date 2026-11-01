import { createTruck, expect, setupApp, T, test, useApp } from "./testkit";

setupApp();

const G = (gal: number) => Math.round(gal * 100);

async function createHours(t: ReturnType<typeof useApp>): Promise<string> {
	const r = await t.request("POST", "/api/equipment", {
		name: "ATV",
		meterKind: "hours",
		currentMeter: T(145),
	});
	expect(r.status).toBe(201);
	return r.data.id as string;
}

async function addFillUp(
	t: ReturnType<typeof useApp>,
	equipmentId: string,
	fill: { loggedAt: string; odometer: number; gallons: string; pricePerGallonCents?: number },
) {
	return t.request("POST", `/api/equipment/${equipmentId}/fuel`, fill);
}

test("fuel: crud with computed totals", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000);

	let r = await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(12000),
		gallons: "10",
	});
	expect(r.status).toBe(201);
	expect(r.data.gallonsHundredths).toBe(G(10));
	expect(r.data.totalCostCents).toBeNull(); // unpriced

	r = await addFillUp(t, truckId, {
		loggedAt: "2026-02-10",
		odometer: T(12300),
		gallons: "15",
		pricePerGallonCents: 350,
	});
	expect(r.status).toBe(201);
	// 15 gal x $3.50/gal = $52.50
	expect(r.data.totalCostCents).toBe(5250);
	const secondId = r.data.id as string;

	r = await t.request("GET", `/api/equipment/${truckId}/fuel`);
	expect(r.status).toBe(200);
	expect(r.data.summary.logCount).toBe(2);
	expect(r.data.summary.lastMpgTenths).toBe(200); // 300 mi / 15 gal

	r = await t.request("PATCH", `/api/fuel/${secondId}`, { pricePerGallonCents: 400 });
	expect(r.status).toBe(200);
	expect(r.data.totalCostCents).toBe(6000); // 15 x $4.00

	// clearing the price is explicit null
	r = await t.request("PATCH", `/api/fuel/${secondId}`, { pricePerGallonCents: null });
	expect(r.status).toBe(200);
	expect(r.data.pricePerGallonCents).toBeNull();
	expect(r.data.totalCostCents).toBeNull();

	r = await t.request("DELETE", `/api/fuel/${secondId}`);
	expect(r.status).toBe(200);
	r = await t.request("GET", `/api/equipment/${truckId}/fuel`);
	expect(r.data.summary.logCount).toBe(1);

	// delete cascades with equipment removal (FK), and unknown id is 404
	r = await t.request("DELETE", "/api/fuel/nope");
	expect(r.status).toBe(404);
});

test("fuel: rejected for non-miles equipment", async () => {
	const t = useApp();
	await t.setup();
	const atvId = await createHours(t);

	let r = await addFillUp(t, atvId, {
		loggedAt: "2026-01-10",
		odometer: T(145),
		gallons: "8",
	});
	expect(r.status).toBe(400);
	expect((r.data.error.message as string).toLowerCase()).toContain("mile");

	r = await t.request("GET", `/api/equipment/${atvId}/fuel`);
	expect(r.status).toBe(400);
});

test("fuel: odometer sanity bound vs current reading", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000); // current = 12,000 mi

	// 200k miles ahead of the current reading: refused.
	let r = await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(212000),
		gallons: "10",
	});
	expect(r.status).toBe(400);

	// within the bound (25k over) is accepted.
	r = await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(37000),
		gallons: "10",
	});
	expect(r.status).toBe(201);

	// editing INTO an implausible value is also refused.
	const id = (await t.request("GET", `/api/equipment/${truckId}/fuel`)).data.entries[0].id;
	r = await t.request("PATCH", `/api/fuel/${id}`, { odometer: T(500000) });
	expect(r.status).toBe(400);
});

test("fuel: validation errors", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000);

	// gallons must be positive with max two decimals
	let r = await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(12000),
		gallons: "10.123",
	});
	expect(r.status).toBe(422);
	r = await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(12000),
		gallons: "0",
	});
	expect(r.status).toBe(422);

	// odometer required
	r = await t.request("POST", `/api/equipment/${truckId}/fuel`, {
		loggedAt: "2026-01-10",
		gallons: "10",
	});
	expect(r.status).toBe(422);

	// bad date
	r = await addFillUp(t, truckId, {
		loggedAt: "01/10/2026",
		odometer: T(12000),
		gallons: "10",
	});
	expect(r.status).toBe(422);
});

test("fuel: requires session", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000);

	let r = await t.request("GET", `/api/equipment/${truckId}/fuel`, undefined, { anon: true });
	expect(r.status).toBe(401);
	r = await t.request(
		"POST",
		`/api/equipment/${truckId}/fuel`,
		{ loggedAt: "2026-01-10", odometer: T(12000), gallons: "10" },
		{ anon: true },
	);
	expect(r.status).toBe(401);
	r = await t.request("DELETE", "/api/fuel/whatever", undefined, { anon: true });
	expect(r.status).toBe(401);
});

test("fuel: economy summary math over three fill-ups", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 1200);

	await addFillUp(t, truckId, { loggedAt: "2026-01-01", odometer: T(1000), gallons: "9" });
	await addFillUp(t, truckId, {
		loggedAt: "2026-02-01",
		odometer: T(1100),
		gallons: "5",
		pricePerGallonCents: 300,
	});
	await addFillUp(t, truckId, {
		loggedAt: "2026-03-01",
		odometer: T(1200),
		gallons: "10",
		pricePerGallonCents: 400,
	});

	const r = await t.request("GET", `/api/equipment/${truckId}/fuel`);
	expect(r.status).toBe(200);
	const s = r.data.summary;
	expect(s.logCount).toBe(3);
	expect(s.distanceTenths).toBe(T(200)); // max - min
	// 200 mi / 15 post-first gal = 13.3
	expect(s.blendedMpgTenths).toBe(133);
	expect(s.lastMpgTenths).toBe(100); // 100 mi / 10 gal
	// cost only from priced fill-ups: 5x$3 + 10x$4 = $55
	expect(s.totalCostCents).toBe(5500);
	// weighted avg price: 5500/15 = 366.67 -> 367
	expect(s.avgPricePerGallonCents).toBe(367);
	// entries ordered by odometer; first has no mpg
	expect(r.data.entries[0].mpgTenths).toBeNull();
	expect(r.data.entries[1].mpgTenths).toBe(200); // 100 mi / 5 gal
	expect(r.data.entries[2].mpgTenths).toBe(100); // 100 mi / 10 gal
});

test("fuel: fill-ups never change the equipment reading", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000);

	await addFillUp(t, truckId, {
		loggedAt: "2026-01-10",
		odometer: T(12150),
		gallons: "10",
	});
	const r = await t.request("GET", `/api/equipment/${truckId}`);
	expect(r.data.currentMeter).toBe(T(12000));
});
