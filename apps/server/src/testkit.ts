import { type DatabaseHandle, openDatabase, runMigrations } from "@maintenance-tracker/db";
import { createApp, makeDeps } from "./app.ts";
import { LoginGuard } from "./auth/ratelimit.ts";

/**
 * Shared in-process API test kit: fresh in-memory DB, fake clock, cheap
 * argon2. Every request goes through the REAL app + middleware chain.
 */

process.env.MT_ARGON2_PRESET = "test";

export const PASSWORD = "correct-horse-battery";
export const NOW0 = Date.parse("2026-06-15T12:00:00Z"); // "today" = 2026-06-15 in UTC

export interface CallInit extends RequestInit {
  ip?: string;
  auth?: boolean; // attach the captured session cookie
  origin?: string; // explicit Origin header (CSRF probes)
  noOrigin?: boolean; // send NO Origin at all (browser XHR always sends one on POST)
}

/** Response with untyped JSON — tests poke arbitrary shapes on purpose. */
export interface TestResponse extends Response {
  // biome-ignore lint/suspicious/noExplicitAny: deliberate test ergonomics
  json: () => Promise<any>;
}

export interface TestApp {
  app: ReturnType<typeof createApp>;
  handle: DatabaseHandle;
  clock: { ms: number; advance: (ms: number) => void };
  cookieValue: () => string;
  call: (path: string, init?: CallInit) => Promise<TestResponse>;
  setup: (password?: string) => Promise<TestResponse>;
  login: (password?: string, ip?: string) => Promise<TestResponse>;
  setupAndLogin: (password?: string) => Promise<void>;
  close: () => void;
}

export function buildTestApp(
  opts: { insecureCookies?: boolean; trustProxy?: boolean } = {},
): TestApp {
  const handle = openDatabase(":memory:");
  runMigrations(handle.db);

  const clock = {
    ms: NOW0,
    advance: function (ms: number) {
      this.ms += ms;
    },
  };
  const guard = new LoginGuard({ now: () => clock.ms });
  const deps = makeDeps(handle.db, {
    session: {
      idleMs: 30 * 86_400_000,
      absoluteMs: 90 * 86_400_000,
      insecureCookies: opts.insecureCookies ?? true,
    },
    guard,
    trustProxy: opts.trustProxy ?? false,
    tz: "UTC",
    clock: () => clock.ms,
  });
  const app = createApp({ deps });

  let cookie = "";

  async function call(path: string, init: CallInit = {}): Promise<TestResponse> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (init.auth && cookie !== "") headers.set("cookie", `mt_session_dev=${cookie}`);
    if (init.origin !== undefined) headers.set("origin", init.origin);
    else if (init.auth && !init.noOrigin) headers.set("origin", "http://localhost:8787"); // like fetch()

    const url = path.startsWith("http") ? path : `http://localhost:8787${path}`;
    const res = await app.request(
      url,
      { method: init.method ?? "GET", headers, body: init.body },
      { info: { remoteAddress: init.ip ?? "203.0.113.7" } },
    );
    const setCookie = res.headers.get("set-cookie");
    const match = setCookie?.match(/mt_session(?:_dev)?=([^;]+)/);
    if (match?.[1]) cookie = match[1];
    return res as unknown as TestResponse;
  }

  const json = (v: unknown) => JSON.stringify(v);

  return {
    app,
    handle,
    clock,
    cookieValue: () => cookie,
    call,
    setup: (password = PASSWORD) =>
      call("/api/auth/setup", { method: "POST", body: json({ password }) }),
    login: (password = PASSWORD, ip?: string) =>
      call("/api/auth/login", { method: "POST", body: json({ password }), ip }),
    async setupAndLogin(password = PASSWORD) {
      const res = await this.setup(password);
      if (!res.ok && res.status !== 403) throw new Error(`setup failed: ${res.status}`); // 403 = already set up
      cookie = "";
      const login = await this.login(password);
      if (!login.ok) throw new Error(`login failed: ${login.status}`);
    },
    close: () => handle.sqlite.close(),
  };
}

export async function errorOf(
  res: Response,
): Promise<{ code: string; details?: { path: string }[] }> {
  const body = (await res.json()) as { error: { code: string; details?: { path: string }[] } };
  return body.error;
}

/** Create an equipment through the API. Returns its row. */
export async function makeEquipment(
  t: TestApp,
  data: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const res = await t.call("/api/equipment", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ name: "Truck", ...data }),
  });
  if (!res.ok) throw new Error(`equipment create failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}
