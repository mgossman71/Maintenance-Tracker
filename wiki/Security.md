# Security

The threat model: a single administrator on a home network, with the app
behind a reverse proxy that may one day face the internet. Defenses assume
the network is not trusted.

## Authentication

- **One master password**, min. 10 characters, stored only as an
  **Argon2id hash** (via Bun's built-in Argon2). It is never logged or
  transmitted beyond the login/setup/change endpoints.
- **Setup is one-shot** and race-safe: `/api/setup` only works while no
  password exists; concurrent first-requests can't both win.
- **Login rate limiting**: **10 failures per 15 minutes** per client triggers
  a **15-minute lockout** (in-memory buckets; a container restart clears
  them, which is acceptable for a single-process home app). The 429 message
  includes the retry-seconds countdown. Behind a proxy, client identity comes
  from `X-Forwarded-For` only when `MT_TRUST_PROXY=1`.
- **Password change** requires the current password and **revokes every
  session** — including the one making the request.
- **Lost password** requires shell access via the reset CLI (see
  [Backup & Recovery](Backup-and-Recovery#lost-password)) — no email, no
  network-exposed reset flow.

## Sessions

- Opaque random tokens; only the **hash** is stored server-side.
- Idle expiry + absolute expiry (`MT_SESSION_IDLE_DAYS` /
  `MT_SESSION_MAX_DAYS`), sliding-then-capped.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` with
  `__Host-mt_session` semantics when `MT_SECURE_COOKIES=1` — the cookie is
  pinned to the exact HTTPS origin and cannot be set or read by any other
  site.
- All sessions die on password change or reset. `Logout` revokes the current
  session.

## Authorization

There is **no authorization surface to bypass**: every `/api/*` route except
`POST /api/setup`, `POST /api/login`, and `GET /api/session` requires a valid
session, enforced by one middleware guard. `/health` is unauthenticated but
returns only status + version. An endpoint audit is part of the test suite.

## CSRF & clickjacking

- State-changing requests (`POST/PATCH/PUT/DELETE` on `/api/*`) must carry an
  `Origin` matching the app (strict full-origin match). With
  `MT_TRUST_PROXY=1` the check relaxes to **hostname match**, because a
  TLS-terminating proxy legitimately changes the scheme between browser and
  container. Requests without `Origin` (rare, non-browser) are rejected if
  `Sec-Fetch-Site: cross-site`.
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` — the app can never
  be framed.

## Response headers (every response)

```
Content-Security-Policy: default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cache-Control: private, no-store        (all /api/* responses)
```

Scripts and network calls are same-origin only — the SPA ships no inline
scripts and no third-party code, so even a hypothetical injection can't
exfiltrate or phone home.

## Uploads (documents & attachments)

The dangerous case is a hostile file the server later serves back — so the
server never trusts anything the client says:

- **Magic-byte sniffing** against a small allowlist: PNG, JPEG, GIF, WebP,
  PDF. Content decides type, always — an HTML file named `.png` is refused
  with `415`, and **SVG is never accepted** (it can carry scripts).
- **Random storage names** (UUID + type-derived extension) under
  `MT_DATA_DIR/uploads`. User filenames are display metadata only and never
  touch a filesystem path → no path traversal, no overwrite, no guessing.
- **Serving**: images render `inline`; everything else (PDFs) is
  `Content-Disposition: attachment`. Downloads require a session — file URLs
  are unguessable _and_ protected.
- Per-file size cap (`MT_MAX_UPLOAD_MB`, default 10), enforced before writes.
- Deleting a service event, document, or equipment removes rows **and the
  files on disk** (cascade cleanup verified by tests).

## Data layer

- SQLite in WAL mode via **Drizzle with parameterized queries only** — no SQL
  string interpolation anywhere.
- Every request body is parsed and rejected by **Zod schemas** shared with
  the client (types and validation can't drift).
- Secrets (the password hash, session hashes) never leave the database;
  `.gitignore` excludes `.env`, `data/`, and everything runtime.

## Container & network

- Image runs as **non-root** `mtuser` (uid 10001); pinned Bun base; only
  `/data` is writable.
- Compose maps the port to `127.0.0.1` by default. The app itself serves no
  TLS: HTTPS + HSTS belong to the reverse proxy, and the README walks through
  Nginx Proxy Manager.
- **Zero outbound network requirements** — no update pings, no telemetry.
  CI runs `bun audit` for dependency hygiene.

## Known limitations (accepted for v1)

- Single-user: any session = full admin (that's the design).
- Login rate limiting is per-process (cleared by a container restart).
- Security depends on the reverse proxy's TLS config — keep the proxy
  updated and the port loopback-bound.
