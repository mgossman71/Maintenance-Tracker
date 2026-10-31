# Build Plan — our maintenance tracker

> Name: **Maintenance-Tracker** — public repo, this folder
> (`~/Documents/GITHUB/Maintenance-Tracker`). Env prefix `MT_`,
> package scope `maintenance-tracker`.
> Status: planning → stack locked (TypeScript full-stack on Bun);
> exposure model locked (internet behind our own HTTPS reverse proxy,
> one master password)
> Deploy target: dev on macOS → **Ubuntu 24.04 (linux/amd64)**, Docker;
> reverse proxy examples led by Caddy (nginx secondary)
> Provenance: OpenMaintenance served as a working demo and a security
> case study. **No code and no data are reused from it**, and we are
> deliberately going in a different direction (password-authenticated,
> internet-exposed, meter-unit-aware). Credit line optional, revisit if the
> design keeps diverging.

## 1. Why a new tool

OpenMaintenance proved the product shape (dashboard-hero maintenance
tracking) but its implementation friction is real (dual codegen steps,
cgo/sqlite, config resolved next to the binary), and its security posture —
no authentication on all interfaces — is wrong for how we intend to deploy:
**public internet, behind our own HTTPS reverse proxy**. New tool, new stack,
security designed around the real deployment from day one.

## 2. Product scope

### Keep (the product shape)
- **Dashboard is the hero screen** — overdue + coming-soon at a glance, per
  equipment grouping, urgency colors, "update meter" freshness reminders.
- **Equipment tab** — plural in the old app; ours is **"Equipment"**.
- **History** — stays, but **demoted**: a tab inside each equipment
  (Tasks · History · Documents · Info), not a top-level nav item.
- **Settings tab** — theme, security, task library, about.
- **Light / Dark / Auto theme** (persisted, system-following default).
- **Backups** — deferred (design notes in §7): archive of database +
  attachments, with retention/rotation.

### Change
- **Unit-aware intervals.** "Hours until service" becomes "N *units* until
  service", where the unit comes from the equipment's **meter**:
  - `miles` → cars (odometer)
  - `hours` → engines/machines (hour meter)
  - `none`  → time-only equipment (boiler, house)
  Every meter flow carries over: update reading, "same reading" dismissal,
  reading-never-lowers-silently, explicit "correct reading", and mileage
  progression via interventions.
  (M4 contract: `POST /api/equipment/:id/reading` — equal value = the "same
  reading" dismissal, which refreshes the reading date; a *lower* value is
  rejected `meter_regressed` unless the request explicitly sends
  `correct: true`, which the UI only does behind a confirmation step.)
- **Task name is a picker.** "Add task" opens a combobox over the **task
  library** (editable, seeded with car/boat/home starters, each preset
  carrying default intervals — e.g. *Oil change: 5,000 mi / 12 mo*,
  *Impeller: 250 h / 24 mo*). Choosing **Custom…** reveals a free-text field.
  Selecting a preset prefills name + intervals, both still editable.

### Add
- **Password protection** — one master password gates the entire app
  (single user, no accounts, no roles). See §6.

Backups (scheduled, startup snapshot, GitHub push) are **deferred out of
v1** — design notes kept in §7 for post-v1 work.

## 3. Stack (locked)

| Concern        | Choice                                             | Why |
|----------------|----------------------------------------------------|-----|
| Runtime        | **Bun** (exact version pinned)                     | One language everywhere; built-in `bun:sqlite` — no native toolchain, no cgo. Bun ships no official LTS, so "LTS" = one pinned version in `packageManager` + CI |
| API            | **Hono** + **zod**                                 | Tiny, typed, runs natively on Bun |
| DB             | **SQLite + Drizzle ORM**                           | Typed schema is the migration source; zero codegen |
| Frontend       | **React + Vite + TypeScript**                      | Component ecosystem for pickers, forms, dark mode |
| UI kit / CSS   | **Tailwind CSS + shadcn/ui**                       | Polished, themeable, accessible |
| Data fetching  | **TanStack Query** + **TanStack Router**           | Cache + mutation invalidation is this app's whole life |
| Auth           | **argon2id** password hash + server-side sessions  | Right tool for one-master-password web apps |
| Shared types   | `packages/shared` workspace                        | API types + due-status engine imported by server *and* client — one source of truth, no codegen |
| Deploy         | Docker multi-stage, single image                   | One-command self-host; `linux/amd64` target (Ubuntu 24.04); sits behind a TLS-terminating reverse proxy |
| Tests          | `bun test` (unit/API) + **Playwright** (e2e)       | Proven suite shape |

Explicitly rejected: API/type codegen (OpenAPI-style dual pipelines — note:
local, instant, compile-checked route-tree codegen, e.g. TanStack Router's,
is fine because a stale tree is a compile error, not a runtime lie), cgo
SQLite, Next.js/Remix (no SSR/SEO need for an auth-gated app), Rust as
product stack, multi-user auth (scope).

## 4. Domain model (draft)

```
Equipment   id, name, description, icon (emoji),
            meter: { kind: none | hours | miles }  (immutable once readings exist)
            reading: number | null, reading_updated_at

Task        id, equipment_id, name, description,
            months_interval?: int, meter_interval?: int   (≥1 of them; none if expiry kind)
            kind: interval | expiry                        (fixed at creation)
            current_expiry_date?          (expiry kind)
            → derived: due_status, next_due_date, next_due_meter, urgency

Intervention id, task_id? | (equipment_id + label), date,
            meter_at?: number (validated: never negative; never lowers),
            location?, performed_by?, comments?, expiry_date? (expiry tasks)

Attachment  equipment documents (any MIME, served attachment) +
            intervention photos (image MIME-sniffed, stored with derived ext)

TaskPreset  id, name, months_interval?, meter_interval?, sort order
            (the editable task library; seeded on first run)

Session     id (random 256-bit), created_at, expires_at, last_seen_at
            (server-side so logout and password change can revoke)

Settings    theme, auth { password_hash, setup_complete }
```

Due-status engine (pure function, `packages/shared`): inputs = task +
equipment reading + intervention history + now + TZ. This is the crown jewel;
it gets the timezone test matrix (UTC, ±east, ±west, +14). **Month intervals
are calendar months, clamped** (Jan 31 + 1 mo → Feb 28/29) — pinned here so
the M1 test matrix encodes it.

## 5. Architecture & repo layout

```
maintenance-tracker/
  apps/
    server/        Hono API + static hosting of web build
    web/           React SPA (Vite)
  packages/
    shared/        zod schemas, types, due-status engine, date math
    db/            drizzle schema, migrations, repositories
  docker/          Dockerfile, config examples
  build-plan.md    (this file)
```

- Single process serves API + SPA (same-origin → no CORS needed at all).
- **Config is env-first** (12-factor): `MT_PORT`, `MT_BIND` (default
  `127.0.0.1`), `MT_DATA_DIR` (default `./data`: db + files),
  `MT_TRUST_PROXY` (enables `X-Forwarded-Proto/For` handling), `TZ`.
  No config-file-next-to-the-binary dance.
- GitHub Actions CI: typecheck, lint, unit+API tests, Playwright, Docker build.
- **Migrations are append-only from the first launch on any real database.**
  `0000_init` was legitimately squashed pre-release (nothing deployed), but a
  squashed number replayed against an existing volume = crash-loop
  (`table already exists`). Reset a stale dev volume with
  `docker compose down -v`. After the first public release, never squash.
- **Public-repo discipline from commit one**: `data/` (db, uploads) and `.env`
  in `.gitignore` before anything else ships; "nothing sensitive ever
  committed" is a gate in the final security checklist.

## 6. Security posture (threat model: exposed to the public internet)

**Deployment reality (decided 2026-10-31):** the app runs behind our own
TLS-terminating reverse proxy and is reachable from the internet. **One
master password, one user, no accounts or roles** — the app is
authenticated-or-nothing, everywhere.

1. **Master password.** First-run setup screen sets it (stored as an
   argon2id hash in the DB). Change it in Settings. Emergency reset via CLI
   flag (`--reset-password`), because headless Docker has no forgotten-
   password email.
2. **Sessions.** Server-side session store; cookie
   `__Host-mt_session`: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`;
   session id regenerated on login; logout and password change revoke all
   sessions. Idle expiry (default 30 days, configurable) + absolute cap.
3. **CSRF (cookies make this matter).** SameSite=Strict plus `Origin`
   verification on every mutating request. This was a non-issue in the demo
   app precisely because it had no cookies; we do have cookies, so we do the
   checks.
4. **Login hardening.** Per-IP rate limiting (trust `X-Forwarded-For` only
   when `MT_TRUST_PROXY=1`), exponential lockout after repeated failures,
   identical error for wrong-user-shaped mistakes (n/a with one user: the
   error is one generic string), timing-equalized hash compare.
5. **Everything behind auth except two routes.** No public object access:
   downloads, photos, version info all require the session
   cookie. Public: `/login` and a no-content `/health` for the proxy's
   health checks (never leaks version or config).
6. **Reverse proxy contract.** The container binds loopback/private; the
   proxy owns TLS + HSTS. `Secure` cookies are only safe behind TLS, so the
   app verifies forwarded protocol when `MT_TRUST_PROXY=1` and refuses to
   set `Secure` cookies over plain HTTP in local dev via an explicit flag
   instead of guessing.
7. **Headers.** CSP (no inline scripts), `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`,
   `Cache-Control: no-store` on authenticated API responses (private data
   must not sit in shared caches/proxies).
8. **Uploads & files.** Global request size limits; per-upload caps; every
   upload MIME-sniffed; **stored extension always derived from sniffed
   MIME**; documents served `Content-Disposition: attachment`; photos inline
   only when image. Files `0600`, dirs `0700`; container runs non-root
   (uid 1000).
9. **SQL via prepared statements only** (Drizzle makes this structural).
10. **Secrets & repo hygiene.** Public repo: `.gitignore` covers `data/`
    and `.env` from the first commit; the M9 checklist includes a leak
    check. Dependency hygiene: `bun audit` + renovate from M0.
11. **No data exchange with OpenMaintenance.** It remains an unlinked demo;
    no importer, no shared files.

## 7. Backups — **deferred (design notes only, not v1 scope)**

None of this is built in v1; kept here so the post-v1 design starts
somewhere. Sketch:

- **Triggers**: on startup (pre-migration rollback point) + cron schedule
  (default daily 03:00) + manual "Back up now" in Settings.
- **Archive**: SQLite snapshot via `VACUUM INTO` + `files/` tree → `tar.gz`.
  Deterministic entry order; symlinks/special files skipped. Archives
  contain the DB **with the password hash** (restore keeps the door locked).
- **Local**: `DATA_DIR/backups/<name>.<ts>.tar.gz`, rotate to `keep` (default 7).
- **GitHub**: octokit Contents API commit per archive into
  `backups/<name>.<ts>.tar.gz` on the configured private repo (100 MB/entry
  cap — larger archives stay local with a visible warning). Rotation mirrors
  `keep`.
- **Restore**: documented manual flow (stop, replace db + files/ from
  archive) + `om-restore` helper script. No in-app restore button v1.
- **Settings UI**: schedule, repo, token (masked), last runs with reasons,
  local + GitHub file lists.

## 8. UI map

```
Login       single password field (the only public screen)
Dashboard   hero: per-equipment blocks, overdue first, due-soon amber,
            stale-meter banner with "update reading" / "same reading"
Equipment   list → detail tabs: Tasks · History · Documents · Info
Settings    Appearance · Security (change password) · Task library · About
```

Nav: exactly three top-level items (Dashboard · Equipment · Settings).
Mobile-first (bottom tab bar), dark mode.

## 9. Milestones (each ends runnable + tested; TDD at the seams that matter)

- **M0 — Scaffold**: Bun workspaces, Hono + Vite + React wired, Drizzle +
  migrations runner, Docker multi-stage running, CI green. Acceptance:
  `docker compose up` serves a hello-world SPA + `/api/health`.
- **M1 — Domain core**: schema + due-status engine in `packages/shared`,
  table-driven unit tests incl. the TZ matrix, mileage/hours/months/expiry
  kinds. Pure logic, no HTTP.
- **M2 — API + auth core**: password hash + first-run setup, login/logout/
  session middleware, CSRF origin check, login rate limiter — API tests
  first; then equipment/task/intervention CRUD with zod validation and an
  error envelope with reasons. **No unauthenticated data route ships in any
  milestone after this one.**
- **M3 — Shell + login page**: router, theme system, login/setup screen,
  logout, nav (3 tabs), empty states.
- **M4 — Equipment CRUD + meters**: create/edit/delete, meter kinds,
  update/same/correct reading flows with the never-lower rule.
- **M5 — Tasks + task library**: preset CRUD in Settings with seeds,
  combobox w/ Custom…, interval validation (meter tasks need meter
  equipment), expiry-kind tasks.
- **M6 — Interventions + per-equipment History**: forms, meter recording +
  doubt flow, delete/edit cascade rules, documents + photos (upload rules
  from §6 with failing tests first).
- **M7 — Dashboard**: grouping, urgency ordering, freshness banner, quick
  "Done" opening prefilled intervention form.
- **M8 — Settings**: theme, password change, task library pane (generic
  car/boat/home starters seeded on first run), About.
- **M9 — Hardening & release**: lockout tuning, password reset CLI,
  security acceptance checklist run like an audit (headers, CSRF,
  unauthenticated probes on every route, upload abuse, public-repo leak
  check), README, reverse-proxy examples (Caddy led, as the canonical
  config; nginx secondary — both with TLS).

## 10. Testing strategy

- **Unit (bun test)**: due-status engine is ≥40% of test volume; date
  arithmetic across 5 timezones.
- **API tests**: Hono in-process; **every route has an "unauthenticated
  request gets 401" test from M2 onward**; auth/CSRF/rate-limit rules pinned
  with exact status + reason; upload MIME/size/traversal cases as *failing
  tests first*.
- **Playwright**: happy paths per milestone, suite kept continuously green.
- **Security acceptance checklist (M9)**: run it like the audit that
  produced this section; every §6 rule maps to at least one test name.

## 11. Open questions (not blocking M0)

1. PWA / offline? Icons + manifest are cheap; decide at M7. (Login +
   session cookie still applies.)
2. TOTP 2FA on the master password — post-v1 candidate; §6 keeps room for it.

**Resolved:** name (`Maintenance-Tracker`, `MT_` prefix); repo (this folder,
public on GitHub — data/ gitignored from commit one); task-library seeds
(generic car/boat/home starters at M5); month math (calendar months, clamped);
deploy (Mac dev → Ubuntu 24.04 amd64, Caddy-led proxy example); backups
(deferred — §7).
