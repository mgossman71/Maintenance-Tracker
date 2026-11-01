# Architecture

Authoritative spec: `build-plan.md` at the repository root. This page is the
map for navigating the code.

## Big picture

One Bun process serves both the JSON API (`/api/*`), `/health`, and the
built React SPA (everything else, SPA fallback). Persistence is a single
SQLite file (WAL) via Drizzle; uploads are plain files under the same data
directory. No queues, no cache, no outbound calls — a request handler can
touch only the DB and its own data dir.

```
Browser ── HTTPS (reverse proxy) ──► Bun/Hono process
                                       ├── /api/*    JSON API (Zod-validated)
                                       ├── /health   liveness (no auth)
                                       └── /*        static SPA (vite build)
                                              │
                                   ┌──────────┴───────────┐
                                   │ MT_DATA_DIR          │
                                   │  maintenance.db (WAL)│
                                   │  uploads/<uuid>.<ext>│
                                   └──────────────────────┘
```

## Repository layout

```
apps/server        Hono API, auth, services, migrations-on-startup, CLI
  src/routes/       HTTP layer only: parse input → call service → respond
  src/services/     Domain logic (equipment, tasks, events, status, dashboard, files, settings)
  src/auth/         Argon2id hashing, hashed-opaque sessions, login backoff
  src/http/         Zod parse helper, upload storage (magic-byte sniffing)
  src/testkit.ts    In-process app harness (no sockets, :memory: DB)
apps/web           React 19 SPA — Vite, Tailwind v4, Radix primitives,
                   TanStack Router/Query; a thin lib/api.ts client
packages/shared    Zero-runtime-dep domain core:
  types.ts          Meter kinds, calendar units, status enums
  decimal.ts        Integer-tenths meter math (parse/format — no floats)
  dates.ts          Calendar arithmetic with month-end clamping, tz "today"
  engine.ts         PURE due-status engine (no DB, no I/O — 19 unit tests;
  contracts.ts      Zod inputs + response DTO types shared by server & client
packages/db        Drizzle schema, generated migrations, builtin preset seed
docker/            Multi-stage Dockerfile (non-root, pinned Bun)
tests/e2e          Playwright critical scenario (*.e2e.ts)
```

**Layering rule:** `routes → services → db`. Routes never touch SQL; services
never touch HTTP; `packages/shared` never imports from either side. The status
**engine is pure** — equipment row + latest event + settings in, status out —
which is why it has the densest test suite.

## Data model (SQLite)

| Table                                       | Purpose / notes                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `equipment`                                 | `meter_kind` (miles/hours/none), `current_meter` (int tenths), `meter_verified_at`, `archived_at` |
| `meter_readings`                            | Append-only trail of every reading change/correction                                              |
| `maintenance_tasks`                         | Two-dimension schedule: `meter_enabled`/`meter_interval`, `calendar_*`; `enabled` toggle          |
| `maintenance_events`                        | Service history **and** baselines (`source='baseline'`); cost in integer cents                    |
| `task_presets`                              | 12 builtin seed suggestions + user presets; builtins soft-delete (`hidden`)                       |
| `equipment_documents` / `event_attachments` | Metadata rows; bytes live in `uploads/<uuid>.<ext>`                                               |
| `sessions`                                  | Hash of token (unique index), idle/absolute expiry                                                |
| `app_settings`                              | Key/value: password hash, setup flag, thresholds, stale-reading days                              |

Conventions: ids are app-generated UUID strings; **all meter values stored as
integer tenths**; timestamps are ISO strings set by the app (SQLite rejects
function `DEFAULT`s in generated migrations); foreign keys cascade with
`onDelete: "cascade"` and uploads additionally clean disk files in handlers.

## Request pipeline

1. Security headers middleware (CSP, nosniff, frame deny, no-store on API).
2. Session resolution from cookie (optional — guard decides).
3. CSRF: Origin check on mutating `/api/*` (strict, or hostname-match with
   `MT_TRUST_PROXY=1`).
4. Auth guard: everything except setup/login/session requires a session.
5. Route: `parse(zodSchema, body)` → service call → DTO JSON.
6. Errors funnel to one handler: `{ error: { code, message, fields? } }`,
   Zod issues become `422`/`400` with per-field messages.

## Migrations & startup

On boot: create data dir → open SQLite (`journal_mode=WAL`, foreign keys ON)
→ apply `drizzle/` migrations **append-only, in order** (failure aborts
startup) → seed builtin presets (idempotent). Never edit an applied migration;
generate the next one with `drizzle-kit`.

## The status engine (how a number becomes "Due soon")

`packages/shared/src/engine.ts`: given current meter, last applicable event
(date + meter), task dimensions, and warn thresholds, each dimension returns
`OK | DUE_SOON | DUE | OVERDUE | UNKNOWN`; overall status takes the worst,
with `NEEDS_BASELINE` when a meter task has no baseline or event. Calendar
intervals clamp month-ends (Jan 31 + 1mo → Feb 28/29). "Which event applies"
(last date, tie → has-meter → newest) lives in `services/status.ts`; all
arithmetic is pure and unit-tested. The web app reuses the same engine for
live next-due previews in the task dialog.

## Frontend

TanStack Router (file-ish route tree, auth gate component) + TanStack Query
(reactive cache; mutations invalidate by prefix — one write refreshes
dashboard + equipment + tasks together). The API client emits a global
unauthorized event → router back to login. Theme (auto/light/dark) persisted
in localStorage. Styling: Tailwind v4 + Radix primitives, hand-rolled shadcn
patterns — no component library lock-in.

## Key invariants

- API **wire format is integer tenths both directions** — clients convert
  human input (`parseMeterToTenths`) at the boundary.
- **Omitted vs null matters** in PATCH contracts: absent key = keep stored
  value; explicit `null` = clear it. Zod `optional()` distinguishes them;
  task PATCH merges server-side and revalidates the effective row.
- **Prospective recalculation:** interval edits never rewrite history rows;
  status is always derived from (last applicable event, current interval).
- **Baselines are events** (`source='baseline'`), so "last service" logic has
  exactly one code path.
- Tests use the **in-process harness** (`app.request(...)`) — no sockets, no
  port races; e2e uses `.e2e.ts` so root `bun test` never collects it.
