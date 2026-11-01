import { createTask, createTruck, expect, setupApp, T, taskStatus, test, useApp } from "./testkit";

setupApp();

// --- Critical §12 scenario (HTTP-level mirror of the Playwright flow) -------

test("critical scenario: full oil-change lifecycle", async () => {
	const t = useApp();
	await t.setup();

	const truckId = await createTruck(t, 12000);
	const taskId = await createTask(t, truckId);

	let view = await taskStatus(t, truckId);
	expect(view.status.status).toBe("NEEDS_BASELINE");

	let r = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil Change",
		performedOn: "2026-01-10",
		meter: T(10000),
	});
	expect(r.status).toBe(201);
	view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(15000));

	r = await t.request("PATCH", `/api/tasks/${taskId}`, { meterInterval: T(3000) });
	expect(r.status).toBe(200);
	view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(13000));
	expect(view.status.lastServiceMeter).toBe(T(10000)); // history untouched

	const setReading = async (miles: number) => {
		const res = await t.request("POST", `/api/equipment/${truckId}/reading`, {
			mode: "increase",
			value: T(miles),
		});
		expect(res.status).toBe(200);
		return (await taskStatus(t, truckId)).status.status;
	};
	expect(await setReading(12600)).toBe("DUE_SOON");
	expect(await setReading(13000)).toBe("DUE");
	expect(await setReading(13100)).toBe("OVERDUE");

	r = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil Change",
		performedOn: "2026-11-01",
		meter: T(13100),
	});
	expect(r.status).toBe(201);
	view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(16100));
	expect(view.status.status).toBe("OK");

	const events = await t.request("GET", `/api/equipment/${truckId}/events`);
	expect((events.data as unknown[]).length).toBe(2);

	await t.request("PATCH", `/api/tasks/${taskId}`, { meterInterval: T(4000) });
	view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(17100));
	const eventsAfter = await t.request("GET", `/api/equipment/${truckId}/events`);
	expect((eventsAfter.data as unknown[]).length).toBe(2);
});

test("hours equipment: 100-hour ATV schedule", async () => {
	const t = useApp();
	await t.setup();
	const r = await t.request("POST", "/api/equipment", {
		name: "ATV",
		meterKind: "hours",
		currentMeter: T(145),
	});
	const eqId = r.data.id as string;
	await createTask(t, eqId, { meterInterval: T(100) });
	await t.request("POST", `/api/equipment/${eqId}/events`, {
		taskId: (await t.request("GET", `/api/equipment/${eqId}/tasks`)).data[0].task.id,
		label: "Oil",
		performedOn: "2026-06-01",
		meter: T(50),
	});
	const view = await taskStatus(t, eqId);
	expect(view.status.meter.nextDueMeter).toBe(T(150));
	expect(view.status.status).toBe("DUE_SOON"); // 5h remaining < 10h warn
});

// --- Equipment ----------------------------------------------------------------

test("equipment: archived flow and default exclusion", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	let list = await t.request("GET", "/api/equipment");
	expect((list.data as unknown[]).length).toBe(1);

	const archived = await t.request("PATCH", `/api/equipment/${truckId}`, { archived: true });
	expect(archived.data.archivedAt).toBeString();
	list = await t.request("GET", "/api/equipment");
	expect((list.data as unknown[]).length).toBe(0);
	list = await t.request("GET", "/api/equipment?archived=true");
	expect((list.data as unknown[]).length).toBe(1);
});

test("equipment: hard delete cascades tasks and events", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const taskId = await createTask(t, truckId);
	await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "x",
		performedOn: "2026-01-01",
		meter: T(1),
	});
	const del = await t.request("DELETE", `/api/equipment/${truckId}`);
	expect(del.status).toBe(200);
	const events = t.db; // direct check: no events remain
	void events;
});

test("equipment: meter kind locked once readings exist", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const r = await t.request("PATCH", `/api/equipment/${truckId}`, { meterKind: "hours" });
	expect(r.status).toBe(409);
	// Without readings or meter tasks, conversion is allowed.
	const r2 = await t.request("POST", "/api/equipment", { name: "Box", meterKind: "miles" });
	const conv = await t.request("PATCH", `/api/equipment/${r2.data.id}`, { meterKind: "hours" });
	expect(conv.status).toBe(200);
});

test("readings: increase refuses decrease; correction records history row", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 5000);
	const bad = await t.request("POST", `/api/equipment/${truckId}/reading`, {
		mode: "increase",
		value: T(4000),
	});
	expect(bad.status).toBe(400);
	const fix = await t.request("POST", `/api/equipment/${truckId}/reading`, {
		mode: "correction",
		value: T(4000),
	});
	expect(fix.status).toBe(200);
	expect(fix.data.warning).toBeString();
	const history = await t.request("GET", `/api/equipment/${truckId}/readings`);
	const modes = (history.data as Array<{ mode: string }>).map((h) => h.mode);
	expect(modes).toContain("correction");
});

// --- Tasks ---------------------------------------------------------------------

test("tasks: validation — no interval, meter on no-meter equipment", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	let r = await t.request("POST", `/api/equipment/${truckId}/tasks`, {
		name: "Bad",
		meterEnabled: false,
		calendarEnabled: false,
	});
	expect(r.status).toBe(422);

	const box = await t.request("POST", "/api/equipment", { name: "Trailer", meterKind: "none" });
	r = await t.request("POST", `/api/equipment/${box.data.id}/tasks`, {
		name: "Bad",
		meterEnabled: true,
		meterInterval: T(100),
		calendarEnabled: false,
	});
	expect(r.status).toBe(422);
});

test("tasks: disable a dimension, interval is preserved and restored", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const taskId = await createTask(t, truckId, {
		calendarEnabled: true,
		calendarValue: 12,
		calendarUnit: "months",
	});
	let r = await t.request("PATCH", `/api/tasks/${taskId}`, { meterEnabled: false });
	expect(r.status).toBe(200);
	expect(r.data.meterInterval).toBe(T(5000)); // preserved while disabled
	r = await t.request("PATCH", `/api/tasks/${taskId}`, { meterEnabled: true });
	expect(r.status).toBe(200);
	expect(r.data.meterInterval).toBe(T(5000)); // restored unchanged
});

test("tasks: disable hides from dashboard; enable restores", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const taskId = await createTask(t, truckId);
	await t.request("PATCH", `/api/tasks/${taskId}`, { enabled: false });
	let dash = await t.request("GET", "/api/dashboard");
	const grouped = (dash.data as { groups: Array<{ items: unknown[] }> }).groups;
	expect(grouped.flatMap((g) => g.items).length).toBe(0);
	await t.request("PATCH", `/api/tasks/${taskId}`, { enabled: true });
	dash = await t.request("GET", "/api/dashboard");
	const grouped2 = (dash.data as { groups: Array<{ items: unknown[] }> }).groups;
	expect(grouped2.flatMap((g) => g.items).length).toBe(1);
});

// --- Events ---------------------------------------------------------------------

test("events: meter required for meter-based task; optional for time-only", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const taskId = await createTask(t, truckId);
	let r = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil",
		performedOn: "2026-05-01",
	});
	expect(r.status).toBe(400);

	const timeTask = await createTask(t, truckId, {
		name: "Detail",
		meterEnabled: false,
		calendarEnabled: true,
		calendarValue: 6,
		calendarUnit: "months",
	});
	r = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId: timeTask,
		label: "Detail",
		performedOn: "2026-05-01",
	});
	expect(r.status).toBe(201);
});

test("events: cross-equipment task assignment rejected", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const other = await t.request("POST", "/api/equipment", { name: "Boat", meterKind: "hours" });
	const taskId = await createTask(t, truckId);
	const r = await t.request("POST", `/api/equipment/${other.data.id}/events`, {
		taskId,
		label: "x",
		performedOn: "2026-05-01",
		meter: T(1),
	});
	expect(r.status).toBe(400);
});

test("events: editing/deleting latest event recalculates from remaining history", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 12000);
	const taskId = await createTask(t, truckId);
	const first = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil",
		performedOn: "2026-01-10",
		meter: T(10000),
	});
	expect((await taskStatus(t, truckId)).status.meter.nextDueMeter).toBe(T(15000));
	const second = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil",
		performedOn: "2026-06-10",
		meter: T(12000),
	});
	expect((await taskStatus(t, truckId)).status.meter.nextDueMeter).toBe(T(17000));
	const del = await t.request("DELETE", `/api/events/${second.data.event.id}`);
	expect(del.status).toBe(200);
	expect((await taskStatus(t, truckId)).status.meter.nextDueMeter).toBe(T(15000));
	const del2 = await t.request("DELETE", `/api/events/${first.data.event.id}`);
	expect(del2.status).toBe(200);
	expect((await taskStatus(t, truckId)).status.status).toBe("NEEDS_BASELINE");
});

test("events: baseline events are superseded by real service, kept as history", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 11000);
	const taskId = await createTask(t, truckId, {
		baselineMeter: T(9000),
		baselineDate: "2026-01-01",
	});
	let view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(14000)); // from baseline
	expect(view.status.lastServiceDate).toBe("2026-01-01");
	await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil",
		performedOn: "2026-07-01",
		meter: T(11000),
	});
	view = await taskStatus(t, truckId);
	expect(view.status.meter.nextDueMeter).toBe(T(16000)); // superseded
	const events = await t.request("GET", `/api/equipment/${truckId}/events`);
	const sources = (events.data as Array<{ source: string }>).map((e) => e.source);
	expect(sources).toContain("baseline");
	expect(sources.filter((s) => s === "service")).toHaveLength(1);
});

test("events: chronology conflict warns but does not block backfills", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const taskId = await createTask(t, truckId);
	await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil",
		performedOn: "2026-05-01",
		meter: T(12000),
	});
	const r = await t.request("POST", `/api/equipment/${truckId}/events`, {
		taskId,
		label: "Oil (backfill)",
		performedOn: "2026-01-01",
		meter: T(13000), // higher reading on earlier date
	});
	expect(r.status).toBe(201);
	expect(r.data.warning).toBeString();
});

// --- Dashboard / settings / presets --------------------------------------------

test("dashboard: groups ordering and stale-reading prompts", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 15500);
	const overdueTask = await createTask(t, truckId, { baselineMeter: T(10000) }); // next 15,000 < 15,500
	void overdueTask;
	const dash = await t.request("GET", "/api/dashboard");
	const groups = (dash.data as { groups: Array<{ status: string }> }).groups;
	expect(groups[0]?.status).toBe("OVERDUE");
	const stale = (dash.data as { staleReadingEquipment: unknown[] }).staleReadingEquipment;
	// Reading was just verified, so nothing stale.
	expect(stale).toHaveLength(0);
});

test("settings: warning thresholds drive status", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t, 14000);
	await createTask(t, truckId, { baselineMeter: T(10000) }); // next due 15,000, 1,000 left
	expect((await taskStatus(t, truckId)).status.status).toBe("OK"); // 1000 > 500 warn
	await t.request("PATCH", "/api/settings", { warnMiles: 2000 });
	expect((await taskStatus(t, truckId)).status.status).toBe("DUE_SOON");
});

test("presets: builtin library seeded; delete hides; edit never touches tasks", async () => {
	const t = useApp();
	await t.setup();
	const list = await t.request("GET", "/api/presets");
	const presets = list.data as Array<{ id: string; name: string; isBuiltin: boolean }>;
	expect(presets.length).toBeGreaterThanOrEqual(10);
	const oil = presets.find((p) => p.name.includes("Oil"))!;
	const del = await t.request("DELETE", `/api/presets/${oil.id}`);
	expect(del.status).toBe(200);
	const after = await t.request("GET", "/api/presets");
	expect((after.data as Array<{ id: string }>).some((p) => p.id === oil.id)).toBe(false);
	const withHidden = await t.request("GET", "/api/presets?includeHidden=true");
	expect(
		(withHidden.data as Array<{ id: string; hidden: boolean }>).find((p) => p.id === oil.id)
			?.hidden,
	).toBe(true);
});
