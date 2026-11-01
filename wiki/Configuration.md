# Configuration

All configuration is environment variables (validated at startup — an invalid
value aborts with a clear error). Copy `.env.example` to `.env` for Docker
Compose. Everything below lists the **default**, which is also what the app
uses if the variable is unset.

## Network

| Variable         | Default     | Meaning                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MT_PORT`        | `3000`      | HTTP port the server listens on.                                                                                                                                                                                                                                                                                                          |
| `MT_BIND`        | `127.0.0.1` | Bind address. The Docker image sets `0.0.0.0` (container network is private; keep the host port on loopback or a proxy network).                                                                                                                                                                                                          |
| `MT_TRUST_PROXY` | `0`         | Set `1` **only** when a trusted reverse proxy terminates TLS. Two effects: relaxes the CSRF Origin check from strict origin-match to hostname-match, and reads the client IP from `X-Forwarded-For`/`X-Real-Ip` for the login rate limiter. Never set it if the app is directly reachable — forged headers would defeat both protections. |

## Storage

| Variable      | Default  | Meaning                                                                                                               |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `MT_DATA_DIR` | `./data` | Directory holding `maintenance.db` (SQLite, WAL) and `uploads/`. Create a backup volume here. The image sets `/data`. |

## Sessions

| Variable               | Default | Meaning                                                                                                                                         |
| ---------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MT_SESSION_IDLE_DAYS` | `30`    | Sessions expire after this many days without activity (activity slides the window).                                                             |
| `MT_SESSION_MAX_DAYS`  | `180`   | Absolute cap: re-login required at the latest, however active the session. Must be ≥ idle days.                                                 |
| `MT_SECURE_COOKIES`    | `1`     | `1`: `__Host-mt_session` cookie with `Secure`. Set `0` **only** for local HTTP development (cookie becomes `mt_session_dev`, no `Secure` flag). |

## Uploads

| Variable           | Default | Meaning                                                                                                                                                            |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MT_MAX_UPLOAD_MB` | `10`    | Per-file cap for documents/attachments, enforced server-side (MIME-checked content, not just the request's word for it). Types allowed: PNG, JPEG, GIF, WebP, PDF. |

## Time

| Variable | Default           | Meaning                                                                                                                                               |
| -------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ`     | `America/Chicago` | IANA timezone used to decide "today" for calendar due dates and the dashboard. Set this to **your** timezone so day boundaries match your odometer's. |

## Advanced

| Variable      | Default                | Meaning                                                                               |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `MT_WEB_DIST` | `<repo>/apps/web/dist` | Where the built SPA is served from; baked into the image, you almost never need this. |
| `MT_VERSION`  | baked version          | Displayed at `/health` and in the startup log.                                        |

## What's _not_ configurable

- **Warning thresholds** (Due-soon bands) and **stale-reading age** live in
  Settings → in the database, not the environment.
- The app is single-user by design: one master password, no accounts, no
  SMTP, no OAuth. See [Security](Security).

## Startup validations

Startup fails fast (no silent fallbacks) on: `MT_PORT` out of range,
`MT_SESSION_IDLE_DAYS < 1`, `MT_SESSION_MAX_DAYS < MT_SESSION_IDLE_DAYS`,
`MT_MAX_UPLOAD_MB < 1`, or a failed/partial migration.
