# Troubleshooting & FAQ

## Before anything else

```bash
docker compose logs app | tail -40          # startup errors, migration output
curl -s http://127.0.0.1:3000/health        # {"status":"ok","version":...}
docker compose ps                           # healthy? (healthcheck hits /health)
```

## Startup fails immediately

| Error message                                                        | Fix                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MT_PORT invalid` / `MT_SESSION_*` / `MT_MAX_UPLOAD_MB must be >= 1` | Invalid environment value — see [Configuration](Configuration).                                                                                                                      |
| Migration error mentioning SQL                                       | The volume's database is from an incompatible version, or a previous migration failed halfway. Restore a [backup](Backup-and-Recovery) — do **not** hand-edit `drizzle/` migrations. |
| `EADDRINUSE`                                                         | Another process owns the port: change `MT_PORT` or stop the other listener.                                                                                                          |
| Permission denied writing data dir                                   | The container runs as uid 10001; ensure the bind-mounted directory is writable by it (`chown 10001:10001` on the host dir).                                                          |

## Login problems

- **"Invalid password" but you're sure** — check keyboard/caps. 10 failed
  attempts within 15 minutes triggers a 15-minute lockout with a `429`
  ("Too many failed attempts. Retry in Ns.") — wait it out, or restart the
  container to clear the in-memory counters.
- **You forgot the password** — reset it with the CLI; all sessions are
  revoked ([Backup & Recovery](Backup-and-Recovery#lost-password)).
- **Login loop behind a proxy (cookie never accepted)** — classic causes:
  1. `MT_SECURE_COOKIES=1` but you're browsing over plain HTTP → the browser
     drops the `Secure` cookie. Use HTTPS or set `MT_SECURE_COOKIES=0` for a
     LAN-HTTP experiment.
  2. Accessing the app by multiple hostnames/ports — the `__Host-` cookie is
     pinned to one origin. Pick a single HTTPS origin.
  3. Proxy stripping/modifying headers with `MT_TRUST_PROXY=0` → CSRF
     rejections (`403` on login POST). Set `MT_TRUST_PROXY=1`.
- **Logged out on another device after changing your password** — by design;
  password changes revoke all sessions.

## CSRF 403 "Cross-origin request rejected"

The browser's `Origin` doesn't match the server's view of its own URL. Behind
a TLS-terminating proxy set `MT_TRUST_PROXY=1`. If you access the app via an
extra hostname (IP, alias, port-forward) that the browser didn't type into
the address bar originally… just use one canonical URL.

## Weird due dates / wrong "today"

Calendar math uses the **server's** timezone at request time. Set `TZ` to
your real timezone (it's `America/Chicago` by default). Due-date flips then
happen at your midnight.

## Task shows "Needs baseline" forever

A mileage/hours task needs either a baseline or a service event before a
meter-dimension due date exists. Enter the last-known service via **Record
maintenance** (backdated is fine) — the status recalculates immediately.

## Dashboard says a reading may be stale

You haven't updated or confirmed that equipment's meter in _stale reading
(days)_ (Settings). Open it, enter the real reading, or press **Confirm same
reading** if it hasn't moved. This is a prompt, not an error.

## Uploads

- **"Unsupported file type" (415)** — the file's actual bytes aren't PNG,
  JPEG, GIF, WebP, or PDF (the name doesn't matter; HEIC and SVG are
  rejected). Convert it (e.g. macOS Preview → Export as PNG).
- **Size error** — over `MT_MAX_UPLOAD_MB` (default 10). Raise the variable
  if you store large PDFs.
- **Upload works but the download link 401s elsewhere** — files require a
  session by design; open them in the app.

## Data questions

- **Deleted a task/event by mistake** — there is no trash; restore a
  [backup](Backup-and-Recovery). This is why snapshots matter.
- **Sold a vehicle** — **Archive** it (Info tab): everything is preserved,
  it just disappears from dashboards. Hard delete is permanent and warned
  about.
- **Moved the odometer/swap the hour meter** — use **Correct reading** with
  the true value; corrections are recorded, and meter-based due math follows
  the corrected current reading.
- **Where are uploads on disk?** `MT_DATA_DIR/uploads/` with UUID names —
  back them up alongside `maintenance.db`; don't rename them.

## Performance

SQLite + WAL handles a personal fleet effortlessly. If the dashboard ever
feels slow, check disk health and DB size first — not the app. Single process
by design: don't run replicas against one volume.

## CI & release checks

CI (GitHub Actions) runs: `bun install --frozen-lockfile`, `bun run
typecheck`, `bunx biome ci .`, `bun test`, `bun run build`, then Playwright
e2e and a Docker build job. A red CI on your fork usually means a lockfile
drift or a lint issue — run the same commands locally (see
[Development](Development)).
