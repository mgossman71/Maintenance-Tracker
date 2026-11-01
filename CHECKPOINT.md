# Checkpoint

## Last verified milestone

API backbone for M0–M4 (auth slice, equipment/readings, tasks/intervals, events/baselines, dashboard) — running, tested, and persisted.

## Verification commands

```bash
bun install
bunx biome ci .            # clean
(cd packages/shared && bunx tsc --noEmit)
(cd packages/db && bunx tsc --noEmit)
(cd apps/server && bunx tsc --noEmit)
(cd packages/shared && bun test)   # 33 pass
# manual smoke (critical §12 scenario over HTTP, 17 checks):
MT_DATA_DIR=/tmp/mt-smoke MT_PORT=3987 MT_SECURE_COOKIES=0 bun apps/server/src/index.ts &
bun /tmp/mt-flow.ts   # (to be moved into apps/server tests)
```

## Files changed this session

Full rebuild: root configs (package.json, tsconfig.base.json, biome.json), packages/shared (engine, dates, decimal, contracts + tests), packages/db (schema, migrator, preset seed, drizzle/0000 migration), apps/server (config, app, auth, services, routes, util, types).

## Decisions

- Argon2id via `Bun.password` (bun:argon2 absent in 1.4.4); plan §8 updated.
- Wire format for meters: integer tenths both directions in all DTOs and inputs.
- Task PATCH: optional dimension booleans; server merges + revalidates effective row.
- Baselines = events with `source='baseline'`; no baselines table.
- Timestamps have no DB defaults (app sets them) because SQLite rejected function defaults in generated migrations.

## Known problems

- Server tests + entire web UI pending (see IMPLEMENTATION_STATUS.md).
- Background shells that launch the server with `&` die with the shell; use a persistent shell.

## Single exact next action

Create `apps/server/src/api.test.ts` + `apps/server/src/security.test.ts`: in-memory DB per test via `createAppDatabase(openDatabase(":memory:"))` + `runMigrations` + `seedBuiltinPresets`, `app.request()` direct (no network), covering the §12 scenario plus auth/ownership/validation cases, and move `/tmp/mt-flow.ts` logic into it.
