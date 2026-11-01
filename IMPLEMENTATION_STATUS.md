# Implementation Status

Authoritative progress record (build-plan.md §13). Updated at every checkpoint.

**Baseline note:** the previous app (v0.2.6) was deleted in commit `4d5054f`; this is the rebuilt application on the v1.1 plan.

## Verified complete

| Area | Detail | Evidence |
|---|---|---|
| Tooling | Bun 1.4.4 workspaces, Biome, TS strict, CI-compatible scripts | `bunx biome ci .` clean; `tsc --noEmit` clean ×3 |
| packages/shared | Tenth-integer meter math, calendar arithmetic with clamping + timezone today, pure due-status engine, Zod contracts, DTO types | 33 bun tests pass (all mandatory §4 examples + §12 unit cases) |
| packages/db | Drizzle schema (equipment, meter_readings, tasks w/ per-dimension enable flags, events w/ source=baseline, presets, documents, attachments, sessions, settings KV), initial migration, preset seed | Migration applies; verification query passes |
| Auth (M0 slice) | Argon2id via Bun.password, setup race guard, hashed opaque sessions, idle+absolute expiry, logout, password change revokes all | Smoke: anon API 401, double-setup 409, login ok |
| Equipment (M1) | CRUD, archive, hard delete, meter kind guard, reading update/confirm/correct with `meter_readings` history | Smoke incl. restart persistence |
| Tasks (M2) | CRUD, PATCH merge + effective revalidation, prospective interval edits, meterKind compatibility rules | Smoke critical scenario passes |
| Events (M3) | Record/backfill/edit/delete, meter required for meter tasks, chronology warnings (never block), baseline-as-event strategy, latest-applicable tie-breaker | Smoke + unit tests |
| Dashboard (M4 partial) | Statuses, grouping/ordering, stale-reading prompts, excludes archived/disabled | Smoke returns groups |
| Critical scenario | §12 Playwright equivalent exercised over HTTP: 17/17 checks (12,000→15,000→13,000→DUE_SOON→DUE→OVERDUE→16,100→17,100, history preserved, restart persistence) | `bun /tmp/mt-flow.ts` (to be converted into `bun test` suite) |

## Not yet implemented

- Server `bun test` API/security suites (M0–M4 smoke converted to repeatable tests) — **next action**
- Web SPA (everything UI): routes, dashboard/equipment/tasks/history/settings screens, Edit Interval form, Record Maintenance, themes
- M5 hardening: rate-limit test coverage already coded; header/CSRF tests pending
- M6: documents/attachments upload+download, presets UI, Dockerfile, compose.yaml, .env.example, README, Playwright e2e
- IMPLEMENTATION_STATUS/CHECKPOINT maintenance (this file)

## Known issues / decisions

- API wire format is **integer tenths** for every meter value in both directions (contracts canonicalize; clients use `parseMeterToTenths`/`formatMeter`).
- Login 400-empty artifacts during smoke runs were startup races, not defects; tests must wait for `/health`.
- `scheduleSummary` shows "miles/hours" generically; UI will render the equipment-specific unit.

## Priority queue

1. Server API + security `bun test` suites (convert smoke scenario, add auth/ownership/upload-prep cases)
2. Web SPA (M1→M4 UI)
3. M5 polish + M6 documents/Docker/README/e2e
