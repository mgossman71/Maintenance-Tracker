# Installation

One container, one volume. The app needs no database server, queue, or
outbound network access.

## Requirements

- Docker + Docker Compose (recommended), or Bun 1.4.4 for bare metal.
- A persistent volume/directory for `MT_DATA_DIR` (SQLite DB + uploads).

## Docker Compose (recommended)

```bash
git clone https://github.com/mgossman71/Maintenance-Tracker.git
cd Maintenance-Tracker
cp .env.example .env      # review TZ at minimum
docker compose up -d --build
curl http://localhost:3000/health   # {"status":"ok",...}
```

`compose.yaml` binds the port to `127.0.0.1:3000` on purpose — expose the app
only through a reverse proxy with HTTPS (next section). All state persists in
the `mt_v1_data` volume; **never `docker compose down -v`** unless you mean to
delete your data.

The image (`docker/Dockerfile`) is multi-stage: a build stage compiles the web
SPA, and the runtime stage runs Bun as the non-root user `mtuser` with a
`HEALTHCHECK` against `/health`. Migrations run automatically at startup and
are append-only; a failed migration aborts startup rather than half-deploying.

## HTTPS with Nginx Proxy Manager

1. Put this container and NPM on one shared Docker network: in
   `compose.yaml` uncomment the `npm_proxy` network entry and the
   `external: true` network block at the bottom, then `docker compose up -d`.
2. In NPM create a **Proxy Host**: `mt.example.com` →
   `maintenance-tracker:3000`, enable HTTP/2, force SSL.
3. Keep `MT_TRUST_PROXY=1` and `MT_SECURE_COOKIES=1` in `.env`.
   `MT_TRUST_PROXY=1` relaxes the CSRF origin check to a hostname match, which
   is required when the proxy terminates TLS (browser Origin is `https`, the
   request the container sees is `http`); `MT_SECURE_COOKIES=1` switches to
   the `__Host-`-prefixed session cookie.
4. Remove or keep-loopback the `ports:` mapping. Never expose port 3000
   directly to the internet: the app itself serves no TLS.

Cookies use `__Host-` semantics over HTTPS, so serve the app from a **single
HTTPS origin** (pick `mt.example.com`, don't mix `www`/apex or localhost).

## Bare metal (Bun)

```bash
bun install --frozen-lockfile
bun run build                                  # produces apps/web/dist
MT_DATA_DIR=/srv/mt MT_BIND=127.0.0.1 MT_TRUST_PROXY=1 bun apps/server/src/index.ts
```

Run it under your supervisor of choice (systemd, launchd). Put a TLS reverse
proxy in front and set `MT_TRUST_PROXY=1` only if that proxy is the only thing
that can reach the app — the flag relaxes the CSRF origin check to a hostname
match (see [Security](Security#csrf)).

## Updates

```bash
git pull
docker compose up -d --build
```

Migrations apply on startup. To roll back a container image, restore a
[backup](Backup-and-Recovery) — schema migrations are append-only and older
binaries may not understand newer rows.

## Verifying a healthy install

```bash
curl -s http://127.0.0.1:3000/health            # ok, unauthenticated by design
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/equipment
# 401 — every data endpoint requires login
docker inspect --format '{{json .State.Health}}' maintenance-tracker
```

See [Security](Security) for what each hardening setting does, and
[Configuration](Configuration) for every variable.
