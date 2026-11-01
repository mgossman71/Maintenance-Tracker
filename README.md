# Maintenance Tracker

Self-hosted, single-user vehicle & equipment maintenance tracking. Track
service intervals by **miles, operating hours, and calendar time** — with
clear due/due-soon/overdue status, full service history, and document storage.
One password protects everything; no accounts, no cloud, no telemetry.

> Maintenance intervals are **user-defined suggestions**. Nothing here is a
> manufacturer-approved service schedule — always verify against your owner's
> manual.

## Features

- **Equipment** — trucks, cars, mowers, boats, generators… with mile meters,
  hour meters, or calendar-only.
- **Tasks** — “Oil Change every 5,000 miles or 12 months.” Change an interval
  any time: recalculation is prospective and never rewrites history.
- **Status** — OK / Due soon / Due now / Overdue / Needs baseline, per task,
  on one dashboard. Warning thresholds are configurable.
- **History** — every service with date, meter, cost, parts, notes, photos.
  Backfill old records freely; corrections never destroy data.
- **Fuel economy** — log fill-ups (odometer + gallons, price optional) on
  mile-based equipment; get per-interval and blended MPG plus fuel cost totals.
- **Documents** — manuals and receipts per equipment item.
- **Security** — Argon2id password, hashed server-side sessions, CSRF and
  clickjacking protections, strict CSP, authenticated file storage.

## Tech

Bun 1.4.4 · Hono · Drizzle + SQLite (WAL) · React 19 + Tailwind 4 SPA served by
the same process · Playwright e2e. One container, one volume.

## Documentation

The full manual lives in [`wiki/`](wiki/) — start at
[`wiki/Home.md`](wiki/Home.md). (Those pages are GitHub-wiki-formatted; push
them to the repository wiki with one command if you prefer it hosted there.)

---

## Local development

Requires [Bun](https://bun.sh) 1.4.4.

```bash
bun install
cp .env.example .env            # optional; defaults work locally
bun run dev                     # server :3000 + vite :5173 (proxies /api)
```

Open http://localhost:5173 — the first visit asks you to set the master
password.

### Checks & tests

```bash
bun run typecheck               # all packages
bunx biome ci .                 # lint + format
bun test                        # unit/integration (69 tests)
bun run build                   # production web bundle
bun run e2e                     # Playwright critical scenario (build first)
```

## Docker deployment

```bash
docker compose up -d --build    # .env is optional — copy .env.example only to change defaults
docker compose ps               # healthcheck: http://localhost:3000/health
```

The first run shows the password setup screen at the proxied HTTPS URL (or
`http://<host>:3000` locally). All state (SQLite database + uploads) lives in
the `mt_v1_data` volume under `MT_DATA_DIR` (`/data`). **Never run
`docker compose down -v`** — that deletes the volume with your data.

### Reverse proxy (required for remote access)

The app serves **no TLS of its own** and must never be the public endpoint.
`compose.yaml` publishes the port on all interfaces so an **external reverse
proxy** (Nginx, Nginx Proxy Manager, Caddy, Traefik…) can terminate HTTPS in
front of it. The proxy must:

1. **Terminate TLS** with a valid certificate and force HTTPS (HSTS
   recommended). Cookies use `__Host-` Secure semantics, so the app must be
   served from a **single HTTPS origin**.
2. **Forward the original `Host` header** (`proxy_set_header Host $host;` —
   default in NPM/Caddy/Traefik). The CSRF check compares the browser's
   `Origin` against this.
3. **Set `X-Forwarded-For`** so the login rate limiter sees real client IPs.

And `.env` must set `MT_TRUST_PROXY=1` — it relaxes the CSRF origin check to
a hostname match (required when the proxy terminates TLS) and enables
`X-Forwarded-For` parsing. Keep `MT_SECURE_COOKIES=1` (the default).

**Restrict the published port to the proxy** at the firewall (e.g.
`ufw allow from <proxy-ip> to any port 3001` or a security group) — anyone
who can reach it directly bypasses TLS and can hammer the login endpoint
unthrottled-by-network-devices. If your proxy shares one Docker host, prefer
removing `ports:` entirely and joining the container to the proxy's network.

### Updates

```bash
git pull
docker compose up -d --build    # migrations run automatically at startup
```

Migrations are append-only and run on start; a failed migration aborts
startup rather than partially deploying.

### Backup & restore (manual, v1)

Back up the database with a **consistent snapshot** — never copy live
WAL-mode files:

```bash
# Snapshot the SQLite DB inside the running container (safe under WAL):
docker compose exec app bun -e '
const { Database } = require("bun:sqlite");
const db = new Database("/data/maintenance.db", { readonly: true });
db.exec(`VACUUM INTO "/data/backup-${new Date().toISOString().slice(0,10)}.db"`);
'
# Then copy the snapshot and the uploads directory off the volume:
docker compose cp app:/data/backup-2026-11-01.db ./backup-2026-11-01.db
docker run --rm -v maintenance-tracker_mt_v1_data:/data -v "$PWD:/backup" alpine \
  cp -r /data/uploads /backup/uploads-backup
```

Restore: stop the app, place the snapshot as `maintenance.db` (remove
`-wal`/`-shm` files) and `uploads/` into the volume, start again.

### Lost password?

Reset from the server's shell (no email needed). **All sessions are revoked:**

```bash
# Docker:
docker compose exec app bun apps/server/src/cli/reset-password.ts
# Bare metal:
MT_DATA_DIR=./data bun apps/server/src/cli/reset-password.ts --password "new-password"
```

## Configuration

All environment variables and defaults are documented in
[`.env.example`](.env.example). Key ones: `MT_DATA_DIR` (storage),
`MT_HOST_PORT` (compose host port; container always listens on 3000),
`MT_TRUST_PROXY` (only with a controlled proxy), `MT_MAX_UPLOAD_MB`, `TZ`
(drives calendar due dates).

## Repository layout

```
apps/server      Hono API + static SPA serving + migrations on startup
apps/web         React SPA (Vite, Tailwind 4)
packages/shared  Due-status engine, decimal tenths, Zod contracts, dates
packages/db      Drizzle schema, migrations, preset seed
docker/          Dockerfile (multi-stage, non-root)
tests/e2e        Playwright critical scenario (*.e2e.ts)
wiki/            Documentation site (GitHub-wiki-formatted)
build-plan.md    Authoritative specification
```

## License

MIT
