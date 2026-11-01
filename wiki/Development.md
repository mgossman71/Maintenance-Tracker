# Development

## Prerequisites

- [Bun](https://bun.sh) **1.4.4** (exact — `engines.bun` and CI pin it).
- Docker (optional; needed for the image build job parity).

```bash
bun install        # workspaces: apps/*, packages/*
bun run dev        # server :3000 + Vite :5173 (API proxied) — open :5173
```

First page load asks for the master password (stored under the local
`MT_DATA_DIR`, default `./data` — git-ignored).

## Repo map & scripts

```
apps/server    @mt/server  Hono API, CLI, tests       bun run --filter @mt/server dev
apps/web       @mt/web     React SPA (Vite)           bun run --filter @mt/web dev
packages/shared @mt/shared engine/decimal/contracts   bun run --filter @mt/shared test
packages/db    @mt/db      schema, migrations, seed
```

| Command               | Does                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`         | Both servers (parallel `dev` scripts of `apps/*`).                                                                            |
| `bun test`            | Root: all workspace unit/integration tests.                                                                                   |
| `bun run typecheck`   | `tsc --noEmit` for all 4 packages + `tests/tsconfig.json`.                                                                    |
| `bunx biome ci .`     | Lint + format check (Biome is the single formatter).                                                                          |
| `bun run format`      | `biome check --write .` — auto-fix before committing.                                                                         |
| `bun run build`       | Production web bundle → `apps/web/dist`.                                                                                      |
| `bun run e2e`         | Playwright — its `webServer` boots the server on port 4173 serving the web build (run `bun run build` first; needs chromium). |
| `bun run db:generate` | `drizzle-kit` migration generation wrapper (see below).                                                                       |

The full gate every commit should pass: **`biome ci` → `typecheck` →
`bun test` → `build` → `e2e`** — exactly what CI runs.

## Testing philosophy

- **Engine first**: `packages/shared` carries the densest suite — pure
  functions, mandatory §4 spec examples (month-end clamping, tie-breakers,
  exactly-zero DUE, tenth rounding).
- **API tests** (`apps/server/src/api.test.ts`, `security.test.ts`,
  `files.test.ts`) run the **in-process harness** from `src/testkit.ts`:
  `createTestApp()` wires the Hono app with an `:memory:` SQLite DB and a
  temp data dir, then `app.request(method, path, body)` — no sockets, no
  ports, no races. `useApp()`/`setupApp()` handle per-test reset; login
  helpers keep specs one-liners.
- **e2e** (`tests/e2e/*.e2e.ts`): Playwright against the real server + real
  built SPA, covering the mandatory §12 critical scenario end to end. The
  `.e2e.ts` suffix + `testMatch` keeps them out of `bun test`.

Add a test with every behavior change — CI is the contract.

## Migrations

Schema changes: edit `packages/db/src/schema.ts`, then

```bash
bunx drizzle-kit generate   # appends the next 00NN_*.sql (never edit applied ones)
```

Migrations are **append-only** and run in order on startup. If you're
iterating locally, nuke the local DB (`rm -rf data/`) rather than rewriting
history. SQLite constraints: no function `DEFAULT`s (timestamps are set by
the app), and Drizzle migrations need explicit `.run()` calls for inserts.

## Conventions that will bite you

- **Integer tenths everywhere** for meter values (`decimal.ts` only — never
  float math on meters). Wire format matches storage: numbers, tenths.
- **Omitted ≠ null in PATCH bodies**: Zod `optional()` preserves the
  distinction; task PATCH merges server-side, then revalidates the effective
  row (422 with per-field messages via `validation()`).
- **Baselines are `maintenance_events` rows** (`source='baseline'`) — never a
  separate table, so "last applicable event" has one code path.
- **Timestamps are app-set** ISO strings (`nowIso()`), not SQL defaults.
- Route handlers stay thin: parse → service → DTO; SQL lives only in
  `services/`.
- `packages/shared` must stay import-cheap and side-effect-free (the web app
  bundles it).
- `Bun.password` with `algorithm: "argon2id"` for hashing (the `bun:argon2`
  builtin doesn't exist in this Bun version).
- CSRF compares `Origin` to the **request URL** origin (hostname-match under
  `trustProxy`); Bun's `Request` has no `host` header — don't reintroduce
  that check.
- The web `Field` component forwards its label as `aria-label` — keep
  `getByLabel` working for Playwright.
- Biome ignores `apps/web/src/styles.css` (Tailwind v4 at-rules are outside
  its parser).
- Before e2e: run `bun run build` first (the Playwright `webServer` serves
  `apps/web/dist` from port 4173 with a throwaway data dir), and make sure no
  dev server is squatting that port (`pkill -f "apps/server/src/index.ts"`
  between manual runs).

## CI (`.github/workflows/ci.yml`)

Jobs: `audit` (`bun audit`, advisory-only), `ci`
(install → typecheck → biome → test → build), `e2e` (build web, Playwright
chromium), `docker` (image build). Treat CI steps as fixed contracts — don't
rename scripts they depend on.

## Releasing / versioning

Version string lives in the server config (`MT_VERSION`, default `0.4.0`).
Tag releases on `main`; Docker image builds from `docker/Dockerfile` with
`--build-arg`-free defaults. Keep `bun.lock` committed — CI installs
`--frozen-lockfile`.

## Spec changes

`build-plan.md` is the source of truth; code follows it, not the other way
around. If implementation and plan diverge, fix the plan in the same PR with
the decision noted (Binding-decisions log).
