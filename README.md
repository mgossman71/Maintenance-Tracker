# Maintenance-Tracker

Self-hosted maintenance tracker for the things you own — cars, boats,
machines, the house. Dashboard-first: what's overdue, what's coming,
what meter reading it was based on. One user, one master password, no
accounts, no third-party calls. Everything lives on your server.

## What you get

- **Dashboard hero screen** — every equipment's tasks, overdue first,
  urgency-colored, with a stale-meter banner and a one-tap "Done".
- **Equipment** with a unit-aware meter (`miles`, `hours`, or none).
  "N units until service" instead of "N hours until service".
- **Tasks** — meter intervals (calendar-months too), plain expiry dates,
  or both. Due-status computed by a timezone-tested engine.
- **History per equipment** — record work, photos, documents; the meter
  and expiry dates follow the history (delete the record that set them
  and they roll back).
- **Task library** — editable presets seeded once on first run.
- **Light / dark / auto theme**, mobile-first bottom nav.
- **Security by design** — argon2id password hashing, server-side
  sessions (`__Host-` cookie, SameSite=Strict), CSRF origin checks,
  per-IP lockout, MIME-sniffed uploads, security headers, zero public
  data routes. See [build-plan.md](./build-plan.md) §6 for the posture.

## Deploy

The app binds loopback and speaks plain HTTP — your TLS-terminating
reverse proxy owns HTTPS and HSTS. Run the container, then front it.

```sh
docker compose up -d --build
# app on 127.0.0.1:8787 — not internet-facing yet, on purpose
```

Point **Caddy** (canonical example) or nginx at it:

- [deploy/Caddyfile.example](./deploy/Caddyfile.example)
- [deploy/nginx.example.conf](./deploy/nginx.example.conf)

Set `MT_TRUST_PROXY=1` (already set in docker-compose.yml) so login
rate limiting sees the real client IP, and `TZ` to your timezone so
"due this month" means your month.

Open the https URL, set your master password (12+ characters), done.

### Forgot the master password?

It guards everything and there is no email — shell access is the proof
of ownership:

```sh
docker compose exec app bun src/index.ts --reset-password
```

This rewrites the hash (same 12-character policy) and revokes every
session.

## Config

Env-first; everything except `MT_DATA_DIR` has a sane default.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MT_PORT` | `8787` | listen port |
| `MT_BIND` | `127.0.0.1` | bind address (`0.0.0.0` inside the container network only) |
| `MT_DATA_DIR` | `data` | database + uploads — never commit it |
| `MT_TRUST_PROXY` | `0` | trust `X-Forwarded-For` (set `1` behind your proxy) |
| `TZ` | `UTC` | deployment timezone for due-dates |
| `MT_SESSION_IDLE_DAYS` | `30` | session idle window |
| `MT_SESSION_ABSOLUTE_DAYS` | `90` | session absolute cap |
| `MT_MAX_UPLOAD_MB` | `25` | per-upload / request cap |
| `MT_INSECURE_COOKIES` | `0` | local dev over plain http: drop `Secure`/`__Host-` cookie traits |
| `MT_WEB_DIR` | built SPA | override static asset location |

## Development

```sh
bun install
bun run dev          # api :8787, web :5173 (proxies /api)
bun run build        # web build the server hosts
bun test             # unit + in-process API tests
bun run e2e          # Playwright (builds first)
bun run typecheck    # every workspace
```

Migrations are generated with `bun run db:generate` and are
append-only after release; the schema and engine live in `packages/`,
the Hono API and static hosting in `apps/server`, the React SPA in
`apps/web`.

## Backups

Deferred from v1 by design: everything you need to back up is
`MT_DATA_DIR` (SQLite file + `files/` uploads). Stop the app, copy the
directory, done.

## License & provenance

Built green-field; the design rationale and every locked decision are
in [build-plan.md](./build-plan.md).
