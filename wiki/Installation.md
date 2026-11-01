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

`compose.yaml` publishes the container port on **all host interfaces**
because the intended topology is an external reverse proxy terminating HTTPS
in front of the app (next section). The app itself serves no TLS. All state
persists in the `mt_v1_data` volume; **never `docker compose down -v`** unless
you mean to delete your data.

The image (`docker/Dockerfile`) is multi-stage: a build stage compiles the web
SPA, and the runtime stage runs Bun as the non-root user `mtuser` with a
`HEALTHCHECK` against `/health`. Migrations run automatically at startup and
are append-only; a failed migration aborts startup rather than half-deploying.

## Reverse proxy (HTTPS + remote access)

Any reverse proxy works (Nginx, Nginx Proxy Manager, Caddy, Traefik…). Three
requirements:

1. **Terminate TLS** with a valid cert and force HTTPS.
2. **Forward the original `Host` header** (`proxy_set_header Host $host;` —
   the default in NPM/Caddy/Traefik). The CSRF check compares the browser's
   `Origin` against it.
3. **Set `X-Forwarded-For`** so the login rate limiter sees real client IPs.

Then set `MT_TRUST_PROXY=1` in `.env`. It does exactly two things: relaxes
the CSRF origin check to a **hostname match** — required when the proxy
terminates TLS (the browser's Origin is `https`, the container sees `http`) —
and enables client-IP parsing from `X-Forwarded-For`/`X-Real-Ip`. Keep
`MT_SECURE_COOKIES=1` (default): sessions use the `__Host-`-prefixed Secure
cookie.

Cookies use `__Host-` semantics over HTTPS, so serve the app from a **single
HTTPS origin** (pick `mt.example.com`, don't mix `www`/apex or localhost).

**Firewall the published port down to the proxy** (`ufw`, security groups,
router ACLs). Anyone who can reach the raw port directly bypasses TLS — your
password would cross the wire in plaintext and the app's in-memory login
limiter is the only backstop. If the proxy shares one Docker host, the better
setup is to delete the `ports:` mapping and put the container on the proxy's
network instead (compose networks resolve the service name
`maintenance-tracker:3000` directly).

Nginx Proxy Manager quick recipe: **Proxy Host** → `mt.example.com` →
`your-docker-host:3000` (or `maintenance-tracker:3000` on a shared network),
enable HTTP/2, force SSL.

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
