# Implementation Status

Authoritative progress record (build-plan.md §13). Updated at every checkpoint.

**Baseline note:** the previous app (v0.2.6) was deleted in commit `4d5054f`; this is the rebuilt application on the v1.1 plan.

## Verified complete

| Area            | Detail                                                                                                                                                                 | Evidence                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Tooling         | Bun 1.4.4 workspaces, Biome, TS strict, CI scripts (`typecheck` incl. e2e tsconfig, `build`, `e2e`)                                                                    | `bunx biome ci .` clean; `tsc --noEmit` clean ×4 + tests |
| packages/shared | Tenth-integer meter math, calendar arithmetic w/ clamping + tz today, pure engine, Zod contracts, DTOs                                                                 | 33 bun tests (all mandatory §4 examples)                 |
| packages/db     | Full Drizzle schema, migration `0000_rare_steel_serpent`, builtin preset seed (12)                                                                                     | Migration applies; verification passes                   |
| Auth (M0)       | Argon2id (Bun.password) setup race guard, hashed opaque sessions, idle+absolute expiry, logout, password change revokes all, login backoff                             | security.test.ts                                         |
| Equipment (M1)  | CRUD, archive, hard delete + cascade, meter-kind lock, reading increase/confirm/correct w/ history                                                                     | api.test.ts                                              |
| Tasks (M2)      | CRUD, PATCH merge + revalidation, prospective interval edits, per-dimension enable preserving intervals                                                                | api.test.ts                                              |
| Events (M3)     | Record/backfill/edit/delete, meter rules, chronology warnings, baselines-as-events, tie-breaker                                                                        | api.test.ts                                              |
| Dashboard (M4)  | Grouped statuses (incl. task names), stale-reading prompts                                                                                                             | api.test.ts                                              |
| Web SPA (M1–M4) | Login/setup, dashboard, equipment list/detail w/ 4 tabs, TaskDialog w/ live next-due preview, readings, settings (thresholds/presets/password/theme)                   | `bun run build` + e2e                                    |
| e2e             | Playwright §12 scenario, 100-hour ATV, dashboard aggregation                                                                                                           | `bun run e2e` — 3 passed                                 |
| Uploads (M6)    | Documents + event attachments: magic-byte MIME allowlist (no SVG/HTML), size cap, uuid storage, inline only for images, cascade file cleanup                           | files.test.ts — 9 tests; HTTP smoke 6/6                  |
| Ops (M6)        | `docker/Dockerfile` (multistage, non-root, pinned Bun), `compose.yaml` + healthcheck, `.env.example`, password-reset CLI, README (dev/Docker/NPM/backup/restore/reset) | CLI verified against real DB; docker build running       |

## Test totals

- packages/shared: 33 · apps/server: 36 (api 18, security 10, files 9 — 36 after merges) · e2e: 3

## Not yet implemented

- Nothing blocking: final gate pass + commit remain for M6.
- Post-v1 (explicitly out of scope): automated backups, notifications, multi-user.

## Known issues / decisions

- API wire format: **integer tenths** for meter values both directions.
- CSRF: Origin vs request-URL origin, hostname-match under `MT_TRUST_PROXY=1` (TLS-terminating proxy).
- Timestamps app-set only (no SQLite function defaults in generated migrations).
- e2e specs use `.e2e.ts` so root `bun test` never collects them (Playwright `testMatch` updated).
- Biome ignores `apps/web/src/styles.css` (Tailwind v4 at-rules unparseable).

## Priority queue

1. Final full gate (biome, typecheck, tests, build, e2e, docker build) → commit M6
