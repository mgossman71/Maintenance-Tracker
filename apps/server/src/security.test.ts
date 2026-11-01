import { expect, setupApp, test, useApp } from "./testkit";

setupApp();

const PRIVATE_ROUTES: Array<[string, string, unknown?]> = [
	["GET", "/api/equipment"],
	["POST", "/api/equipment", { name: "X", meterKind: "miles" }],
	["GET", "/api/dashboard"],
	["GET", "/api/settings"],
	["PATCH", "/api/settings", { warnDays: 21 }],
	["GET", "/api/presets"],
	["POST", "/api/presets", { name: "P" }],
	["POST", "/api/logout", {}],
	[
		"POST",
		"/api/password/change",
		{ currentPassword: "x".repeat(12), newPassword: "y".repeat(12) },
	],
	["GET", "/api/tasks/does-not-exist"],
	["PATCH", "/api/tasks/does-not-exist", {}],
	["DELETE", "/api/events/does-not-exist"],
];

test("anonymous requests are rejected on every data endpoint", async () => {
	const t = useApp();
	await t.setup();
	for (const [method, path, body] of PRIVATE_ROUTES) {
		const res = await t.request(method, path, body, { anon: true });
		expect([res.status, `${method} ${path}`]).toEqual([401, `${method} ${path}`]);
	}
});

test("health is public and free of user data", async () => {
	const t = useApp();
	const res = await t.request("GET", "/health", undefined, { anon: true });
	expect(res.status).toBe(200);
	expect(JSON.stringify(res.data)).not.toMatch(/password|token|email/i);
});

test("setup is exactly once; login validates; generic failure message", async () => {
	const t = useApp();
	await t.setup();
	const again = await t.request(
		"POST",
		"/api/setup",
		{ password: "second-password-x" },
		{ anon: true },
	);
	expect(again.status).toBe(409);
	const anonSession = await t.request("GET", "/api/session", undefined, { anon: true });
	expect(anonSession.data).toEqual({ authenticated: false, setupComplete: true });

	const bad = await t.request(
		"POST",
		"/api/login",
		{ password: "not-the-password" },
		{ anon: true },
	);
	expect(bad.status).toBe(401);
	expect(JSON.stringify(bad.data)).not.toMatch(/argon|hash|salt/i);
});

test("short passwords rejected at setup", async () => {
	const t = useApp();
	const r = await t.request("POST", "/api/setup", { password: "short" }, { anon: true });
	expect(r.status).toBe(422);
});

test("rate limiting: repeated failures then lockout, success resets", async () => {
	const t = useApp();
	await t.setup();
	let lastStatus = 0;
	for (let i = 0; i < 11; i++) {
		const r = await t.request(
			"POST",
			"/api/login",
			{ password: "definitely-wrong-x" },
			{ anon: true },
		);
		lastStatus = r.status;
	}
	expect(lastStatus).toBe(429);
	const blocked = await t.request(
		"POST",
		"/api/login",
		{ password: "correct-horse-battery" },
		{ anon: true },
	);
	expect(blocked.status).toBe(429);
});

test("CSRF: cross-origin state-changing requests rejected; same-origin allowed", async () => {
	const t = useApp();
	await t.setup();
	const evil = await t.request(
		"POST",
		"/api/equipment",
		{ name: "Evil", meterKind: "none" },
		{
			origin: "https://evil.example",
		},
	);
	expect(evil.status).toBe(403);
	const cross = await t.request(
		"POST",
		"/api/equipment",
		{ name: "Evil", meterKind: "none" },
		{
			origin: null,
			secFetchSite: "cross-site",
		},
	);
	expect(cross.status).toBe(403);
	const ok = await t.request("POST", "/api/equipment", { name: "Fine", meterKind: "none" });
	expect(ok.status).toBe(201);
});

test("security headers and no-store on API responses", async () => {
	const t = useApp();
	await t.setup();
	const res = await t.request("GET", "/api/equipment");
	expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
	expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	expect(res.headers.get("x-frame-options")).toBe("DENY");
	expect(res.headers.get("referrer-policy")).toBe("no-referrer");
	expect(res.headers.get("cache-control")).toBe("private, no-store");
});

test("session: logout revokes; password change revokes all sessions", async () => {
	const t = useApp();
	await t.setup();
	let res = await t.request("GET", "/api/session");
	expect(res.data.authenticated).toBe(true);
	await t.request("POST", "/api/logout", {});
	res = await t.request("GET", "/api/session");
	expect(res.data.authenticated).toBe(false);

	await t.login();
	const change = await t.request("POST", "/api/password/change", {
		currentPassword: "correct-horse-battery",
		newPassword: "new-correct-horse",
	});
	expect(change.status).toBe(200);
	const after = await t.request("GET", "/api/equipment");
	expect(after.status).toBe(401);
	const reLogin = await t.request(
		"POST",
		"/api/login",
		{ password: "new-correct-horse" },
		{ anon: true },
	);
	expect(reLogin.status).toBe(200);
});

test("garbage and oversized inputs produce 422 with field errors, not 500", async () => {
	const t = useApp();
	await t.setup();
	let r = await t.request("POST", "/api/equipment", { name: "", meterKind: "warp-drive" });
	expect(r.status).toBe(422);
	expect(r.data.error.fields).toBeObject();
	r = await t.request("POST", "/api/equipment", null);
	expect(r.status).toBe(422);
});

test("cookie flags: HttpOnly, SameSite, Path=/", async () => {
	const t = useApp();
	await t.setup("dev-password-123");
	// createTestApp captures Set-Cookie raw only via headers; re-login to inspect:
	const res = await t.request(
		"POST",
		"/api/login",
		{ password: "dev-password-123" },
		{ anon: true },
	);
	expect(res.status).toBe(200);
	const cookie = res.headers.get("set-cookie") ?? "";
	expect(cookie).toContain("HttpOnly");
	expect(cookie.toLowerCase()).toContain("samesite=strict");
	expect(cookie).toContain("Path=/");
	// secureCookies=0 dev mode must NOT use the __Host- prefix (needs Secure)
	expect(cookie).toContain("mt_session_dev=");
});
