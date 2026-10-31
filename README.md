# Maintenance-Tracker

Self-hosted maintenance tracker for the things you own — cars, boats,
machines, the house. Dashboard-first: what's overdue, what's coming,
what meter reading it was based on.

**Status: M0 scaffold.** See [build-plan.md](./build-plan.md) for scope,
stack, security posture, and milestones.

## Stack

Bun (pinned to the version in `engines.bun`) · Hono + zod · SQLite via
Drizzle · React + Vite · Docker, behind a TLS-terminating reverse proxy.

## Quickstart (dev)

```sh
bun install
bun run dev        # api on :8787, web on :5173 (proxies /api)
```

## Quickstart (docker)

```sh
docker compose up --build
# SPA on http://127.0.0.1:8787, health on http://127.0.0.1:8787/api/health
```

Pre-release note: if a development `mt_data` volume predates a squashed
migration, reset it: `docker compose down -v && docker compose up -d --build`.
Never after the first real deployment.

## Config

Env-first — see [.env.example](./.env.example). `MT_DATA_DIR` holds the
database and uploads and must never be committed.
