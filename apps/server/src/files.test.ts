import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createTruck, expect, setupApp, type TestApp, test, useApp } from "./testkit";

setupApp({ MT_MAX_UPLOAD_MB: "1" });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 9, 8, 7]);

function formWith(bytes: Uint8Array, filename: string, type: string): FormData {
	const form = new FormData();
	form.append("file", new File([bytes as unknown as BlobPart], filename, { type }));
	return form;
}

async function createEvent(t: TestApp, equipmentId: string): Promise<string> {
	const r = await t.request("POST", `/api/equipment/${equipmentId}/events`, {
		label: "Oil Change",
		performedOn: "2026-05-01",
	});
	expect(r.status).toBe(201);
	return (r.data as { event: { id: string } }).event.id as string;
}

test("documents: upload, list, and inline download for safe images", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);

	let r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "invoice.png", "image/png"),
	);
	expect(r.status).toBe(201);
	const docId = (r.data as { id: string }).id;
	expect((r.data as { mimeType: string }).mimeType).toBe("image/png");

	r = await t.request("GET", `/api/equipment/${truckId}/documents`);
	expect((r.data as unknown[]).length).toBe(1);

	const dl = await t.request("GET", `/api/documents/${docId}/download`);
	expect(dl.status).toBe(200);
	expect(dl.headers.get("content-type")).toBe("image/png");
	expect(dl.headers.get("content-disposition")).toContain("inline");
	expect(dl.headers.get("cache-control")).toBe("private, no-store");
});

test("documents: MIME sniffing rejects mismatched and unsafe types", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);

	// HTML with a .png name: sniffing sees no PNG magic.
	const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
	let r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(html, "x.png", "image/png"),
	);
	expect(r.status).toBe(415);

	// SVG is never accepted: no inline-executable content, ever.
	const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
	r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(svg, "icon.svg", "image/svg+xml"),
	);
	expect(r.status).toBe(415);

	// Empty file rejected.
	r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(new Uint8Array([]), "e.png", "image/png"),
	);
	expect(r.status).toBe(400);
});

test("documents: size limit enforced (MT_MAX_UPLOAD_MB=1)", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const big = new Uint8Array(1024 * 1024 + 10);
	big.set(PNG); // valid PNG header, oversized body
	const r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(big, "big.png", "image/png"),
	);
	expect(r.status).toBe(400);
	expect(String((r.data as { error: { message: string } }).error.message)).toInclude("MB limit");
});

test("documents: anonymous access rejected everywhere; CSRF applies", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const up = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "a.png", "image/png"),
	);
	const docId = (up.data as { id: string }).id;

	let r = await t.request("GET", `/api/documents/${docId}/download`, undefined, { anon: true });
	expect(r.status).toBe(401);
	r = await t.request("GET", `/api/equipment/${truckId}/documents`, undefined, { anon: true });
	expect(r.status).toBe(401);
	r = await t.request("DELETE", `/api/documents/${docId}`, undefined, { anon: true });
	expect(r.status).toBe(401);
	r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "b.png", "image/png"),
		{
			anon: true,
		},
	);
	expect(r.status).toBe(401);

	const evil = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "evil.png", "image/png"),
		{
			origin: "https://evil.example",
		},
	);
	expect(evil.status).toBe(403);
});

test("documents: storage names are random uuids, never user paths", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const r = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "../../../etc/passwd.png", "image/png"),
	);
	expect(r.status).toBe(201);
	const files = readdirSync(join(t.tempDir, "uploads"));
	expect(files.length).toBe(1);
	expect(files[0]).toMatch(/^[0-9a-f-]{36}\.png$/);
});

test("attachments: upload to event, listed with events, PDF served as attachment", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const eventId = await createEvent(t, truckId);

	const up = await t.requestForm(
		"POST",
		`/api/events/${eventId}/attachments`,
		formWith(PDF, "receipt.pdf", "application/pdf"),
	);
	expect(up.status).toBe(201);
	const attId = (up.data as { id: string }).id;

	const events = await t.request("GET", `/api/equipment/${truckId}/events`);
	const event = (events.data as Array<{ id: string; attachments: Array<{ id: string }> }>).find(
		(e) => e.id === eventId,
	);
	expect(event?.attachments.length).toBe(1);

	const dl = await t.request("GET", `/api/attachments/${attId}/download`);
	expect(dl.status).toBe(200);
	expect(dl.headers.get("content-type")).toBe("application/pdf");
	expect(dl.headers.get("content-disposition")).toContain("attachment");
});

test("attachments: delete removes row and file; equipment delete cascades files", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const eventId = await createEvent(t, truckId);
	const up = await t.requestForm(
		"POST",
		`/api/events/${eventId}/attachments`,
		formWith(JPEG, "photo.jpg", "image/jpeg"),
	);
	const attId = (up.data as { id: string }).id;
	const uploadDir = join(t.tempDir, "uploads");
	expect(readdirSync(uploadDir).length).toBe(1);

	const del = await t.request("DELETE", `/api/attachments/${attId}`);
	expect(del.status).toBe(200);
	expect(readdirSync(uploadDir).length).toBe(0);

	await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(PNG, "d.png", "image/png"),
	);
	expect(readdirSync(uploadDir).length).toBe(1);
	await t.request("DELETE", `/api/equipment/${truckId}`);
	expect(readdirSync(uploadDir).length).toBe(0);
});

test("uploads: stored bytes round-trip exactly", async () => {
	const t = useApp();
	await t.setup();
	const truckId = await createTruck(t);
	const payload = new Uint8Array(2048);
	for (let i = 0; i < payload.length; i++) payload[i] = (i * 7) % 251;
	payload.set(PNG);
	const up = await t.requestForm(
		"POST",
		`/api/equipment/${truckId}/documents`,
		formWith(payload, "rt.png", "image/png"),
	);
	expect(up.status).toBe(201);

	const stored = readdirSync(join(t.tempDir, "uploads"))[0];
	expect(stored).toBeDefined();
	const path = join(t.tempDir, "uploads", stored as string);
	expect(existsSync(path)).toBe(true);
	const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
	expect(bytes.length).toBe(payload.length);
	expect(bytes.every((b, i) => b === payload[i])).toBe(true);
});

test("uploads: unknown equipment and unknown event are 404", async () => {
	const t = useApp();
	await t.setup();
	let r = await t.requestForm(
		"POST",
		"/api/equipment/nope/documents",
		formWith(PNG, "a.png", "image/png"),
	);
	expect(r.status).toBe(404);
	r = await t.requestForm(
		"POST",
		"/api/events/nope/attachments",
		formWith(PNG, "a.png", "image/png"),
	);
	expect(r.status).toBe(404);
});
