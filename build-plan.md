# Maintenance-Tracker — Master Build Plan

**Version:** 1.1  
**Purpose:** Authoritative, self-contained build specification for a self-hosted vehicle and equipment maintenance tracking application.  
**Priority:** Deliver an end-to-end working application. This document supersedes previous plans and does not depend on any deleted file.  
**Revision 1.1:** Resolves review ambiguities with binding decisions — per-dimension enable flags, single baseline strategy (no baselines table), tenth-integer meter arithmetic, meter-readings history table, explicit same-date tie-breaker, auth slice moved into M0, binding CI contract, and added security/ops specifics.

## 1. Product objective

Build a responsive, password-protected web application for scheduling, recording, and reviewing maintenance for cars, trucks, motorcycles, ATVs, dirt bikes, boats, outboards, lawn mowers, snow blowers, generators, and other equipment.

**Central rule:** A recurring maintenance task is performed every **X miles, X operating hours, and/or X calendar interval**. The user controls each interval and can change it at any time. The application records when work actually happened and calculates the next thresholds from the latest applicable service record or explicit starting baseline. For combined schedules, service is due when **either** threshold is reached.

### Non-negotiable outcomes

- Add, edit, archive, and delete equipment with confirmation and clearly described consequences.
- Track current odometer/hour readings and the date they were verified.
- Add, edit, disable, and delete task schedules independently for each equipment item.
- Set and **change maintenance intervals at any time**, including meter-only, calendar-only, or both.
- Record and correct completed maintenance, preserving historical events unless explicitly changed.
- Display remaining mileage/hours/days, upcoming tasks, due and overdue tasks.
- Make service recording and interval editing accessible directly on equipment pages.
- Persist data across restarts and deploy in Docker behind HTTPS.
- Deliver and verify the full UI → API → database → calculation → UI workflow.

### Explicit v1 non-goals

- Multi-user roles and accounts, VIN lookup, automatic OEM schedules, telematics/OBD integration, automatic parts purchasing, push/email/SMS notifications, native mobile apps, cloud sync, and automatic GitHub backup uploads.
- Do not add AI features to the maintenance tracker.
- Never imply preset intervals represent manufacturer-approved service schedules; user verifies intervals.

## 2. Locked architecture

| Layer                       | Technology                       | Notes                                          |
| --------------------------- | -------------------------------- | ---------------------------------------------- |
| Runtime and package manager | Bun, exact version pinned        | One monorepo and reproducible lockfile         |
| API                         | Hono + Zod                       | Typed endpoints, validation at boundaries      |
| Database                    | SQLite + Drizzle ORM             | Schema and append-only migrations              |
| Frontend                    | React + Vite + TypeScript        | Single-page application                        |
| UI                          | Tailwind CSS + shadcn/ui         | Accessible forms and dialog components         |
| Client state                | TanStack Query + TanStack Router | Query invalidation after writes                |
| Shared business logic       | `packages/shared`                | One pure due-status engine, shared schemas     |
| Auth                        | Argon2id + server-side sessions  | Single master password; authenticated app      |
| Test                        | Bun test + Playwright            | Unit, API, and browser workflow tests          |
| Deployment                  | Multistage Docker, linux/amd64   | Ubuntu 24.04; TLS termination at reverse proxy |

**Deployment:** Develop on macOS, deploy to an Ubuntu 24.04 server using Docker Compose and a persistent named volume or bind mount. Support Nginx Proxy Manager as the primary example, with Caddy as an alternative. API and SPA are served under one origin, avoiding cross-origin credentials and unnecessary CORS.

### Repository layout

```text
maintenance-tracker/
  apps/
    server/                 # Hono API, auth, static frontend hosting
    web/                    # React SPA and routes
  packages/
    shared/                 # Zod contracts, date arithmetic, due engine
    db/                     # Drizzle schema, migrations, repositories
  docker/
    Dockerfile
  tests/
    e2e/
  .github/workflows/ci.yml
  compose.yaml
  .env.example
  .gitignore
  README.md
  build-plan.md
  IMPLEMENTATION_STATUS.md
  CHECKPOINT.md
```

Use simple, explicit modules. Do not add a second API framework, ORM, UI kit, or code-generation pipeline.

**Binding CI contract:** `.github/workflows/ci.yml` already exists in the repository and is authoritative for tooling. It pins **Bun 1.4.4** (`oven-sh/setup-bun@v2`), requires `bun install --frozen-lockfile`, `bun run typecheck`, `bunx biome ci .` (Biome is the formatter/linter), `bun test`, `bun run build`, `bun run e2e` with Playwright chromium, and a buildable `docker/Dockerfile`. M0 must satisfy this file exactly; do not adopt ESLint/Prettier or a different Bun version.

## 3. Domain rules and terminology

- **Equipment:** An owned vehicle, machine, or item.
- **Meter:** An equipment reading, measured in **miles**, **hours**, or **none**. Hours may use decimals, e.g., 127.5; miles may also support decimal readings if needed. **Representation decision:** store every meter value as integer tenths of its unit (127.5 → `1275`); one decimal place is the maximum supported precision. All threshold arithmetic and the exactly-zero `DUE` comparison happen in integer tenths — never in binary floating-point. Display trims trailing `.0`.
- **Task preset:** An editable suggestion in the library (e.g., Oil Change). It is _not_ a schedule and changing a preset never silently changes existing tasks.
- **Maintenance task:** A schedule belonging to one equipment item, with independently editable intervals.
- **Service event (intervention):** A record of maintenance actually done on a date, optionally with a meter reading, cost, notes, and attachments.
- **Baseline:** An explicitly entered last-service date/meter, optionally recorded as an initial history event, used to calculate when a task is due. If no credible basis exists, report Needs Baseline.
- **Current reading:** The latest confirmed equipment meter value, independent from service records.
- **Due thresholds:** Calculated date and/or meter reading. They are not historical facts and must be recalculated following relevant edits.

### Equipment meter compatibility

- Equipment with `miles`: mileage and/or calendar schedules, never hour schedules.
- Equipment with `hours`: operating-hour and/or calendar schedules, never mileage schedules.
- Equipment with `none`: calendar-only schedules.
- Equipment meter kind cannot change silently once readings or associated meter-based tasks/history exist. Offer a deliberate, validated conversion/correction process or refuse and explain.

### Scheduling model

- A recurring task requires at least one enabled interval. Meter and calendar dimensions have **independent enabled flags**; disabling a dimension removes it from due calculation but never erases its configured interval value, so re-enabling restores the previous schedule.
- Meter interval: **every X miles/hours**, where X is positive and stored in the equipment's meter unit.
- Calendar interval: **every X days/weeks/months/years**, where X is a positive integer.
- Both may be enabled, interpreted as **OR / whichever comes first**. Display both thresholds; do not predict a calendar date for a mileage/hour threshold without trustworthy usage forecasts.
- Schedule interval changes apply **prospectively to the current calculation**, based on the latest completed event; never overwrite historic events.
- When enabling a new schedule dimension without sufficient last-service values, show the known dimension and visibly flag the missing baseline; do not label the task definitively OK when an enabled dimension cannot be evaluated.
- A task can be disabled and hidden from active due lists while preserving its history; allow viewing disabled tasks.
- Archiving equipment preserves history. Hard deletion is a separate destructive action requiring explicit confirmation and documented cascade behavior.

### Date and time semantics

- Store service dates as local calendar dates (`YYYY-MM-DD`), not UTC timestamps masquerading as calendar dates. Store creation/update audit timestamps in UTC.
- Use configured application timezone (`TZ`, default `America/Chicago`) to determine today's local date.
- Adding N days/weeks uses calendar days; N weeks = 7N days.
- Adding months/years uses calendar arithmetic with invalid-day clamping: Jan 31 + one month = Feb 28/29; Feb 29 + one year = Feb 28 in a non-leap year.
- Do **not** recursively advance next due from its previously computed due threshold: use the latest applicable service/baseline record, so interval editing recalculates correctly.

## 4. Due-status engine (the critical feature)

Create a **pure, deterministic** function in `packages/shared` that accepts: equipment meter kind, optional current meter value, task intervals and enabled status, latest applicable service/baseline values, current local date, timezone context, and warning thresholds. It returns all known due thresholds, signed remaining amounts, per-dimension states, overall state, and explanation(s).

### Core formulas

```text
next_due_meter = last_service_meter + meter_interval
next_due_date  = add_calendar_interval(last_service_date, calendar_interval)
remaining_meter = next_due_meter - current_equipment_meter
remaining_days  = days_between(today_local, next_due_date)
```

Apply each formula only when its input values exist. Never convert unknown to zero. A calendar-only task requires last-service date, not a meter reading. A meter-only task requires a last-service meter but may additionally store date for history. A combined task needs both baselines for complete status evaluation. A null current equipment meter value makes the meter dimension **non-evaluable**: still display the computed next-due threshold, mark that dimension unknown, and apply the NEEDS_BASELINE precedence rule.

### Status precedence

1. `OVERDUE`: At least one evaluable enabled threshold is **past** (`remaining < 0`).
2. `DUE`: At least one evaluable enabled threshold is **exactly reached** (`remaining = 0`) and none is overdue.
3. `DUE_SOON`: At least one evaluable enabled threshold is within its warning range (including the configurable boundary) and none is due/overdue.
4. `NEEDS_BASELINE`: No dimension is evaluable, or an unevaluable dimension prevents a definitive OK determination. Return known thresholds as well, if any.
5. `OK`: All enabled dimensions are evaluable and outside warning ranges.
6. `DISABLED`: Task intentionally excluded from active scheduling (if modeled as a separate state).

When one dimension is due/overdue and another unknown, report the known urgency and flag incomplete data. When only a known dimension is OK but another dimension unknown, overall status is NEEDS_BASELINE, not OK.

**Defaults:** Warn within 500 miles, 10 hours, or 30 days. Store warning thresholds in settings; allow task-specific override as an optional later enhancement, not needed to complete v1. Settings also store the **stale-reading prompt threshold** (default: flag equipment whose `meter_verified_at` is older than 30 days) used by Dashboard prompts.

**Terminology:** `DUE` at exactly zero remaining; `OVERDUE` after crossing threshold. Date-only expiry tasks (e.g., registration expiration) are _not_ part of recurring scheduling v1; do not conflate them with service intervals. They can be added later as an explicit distinct task type.

### Mandatory examples

- Last oil change 10,000 mi, interval 5,000 mi → next at 15,000 mi.
- Change interval to 3,000 mi → next immediately changes to 13,000 mi; history is unchanged.
- Current meter 12,600 mi and warning 500 → DUE_SOON for 13,000 mi.
- Current meter 13,000 mi → DUE; 13,100 mi → OVERDUE.
- Service completed at 13,100 mi → next at 16,100 mi.
- Last oil change Jan 15, 2026 with a 12-month interval → Jan 15, 2027, regardless of meter-only date projections.
- Last service on Jan 31 with one month interval → Feb 28/29.
- For combined 5,000 mi / 12 months, if date is overdue while miles are still OK, task is OVERDUE.

## 5. Data model

Use stable IDs, foreign keys, indexes, and explicit timestamps. Suggested logical entities (physical column names may vary).

### `equipment`

`id`, `name`, `category`, `make`, `model`, `year`, `description`, `meter_kind (miles|hours|none)`, `current_meter_value nullable`, `meter_verified_at nullable`, `archived_at nullable`, `created_at`, `updated_at`.

### `maintenance_tasks`

`id`, `equipment_id`, `name`, `description nullable`, `preset_id nullable`, `enabled`, `meter_enabled`, `calendar_enabled`, `meter_interval nullable`, `calendar_interval_value nullable`, `calendar_interval_unit nullable (days|weeks|months|years)`, `created_at`, `updated_at`.

Validation: an enabled task has at least one enabled dimension whose interval is positive; disabling a dimension never erases its stored interval, so re-enabling restores it unchanged; meter interval allowed only on meter equipment. Uniqueness of names is **not** mandatory.

### `maintenance_events`

`id`, `equipment_id`, `task_id nullable`, `label`, `source (service|baseline, default service)`, `performed_on (date)`, `meter_value nullable`, `notes nullable`, `service_provider nullable`, `cost_cents nullable`, `parts_used nullable`, `created_at`, `updated_at`.

Allow general unscheduled equipment events with `task_id=null`. Require task association for an event to advance that task's schedule; baseline rows (`source='baseline'`) always carry a task association. Cost stored in integer cents. Ensure event equipment matches associated task equipment.

### Baselines — decided: no separate table

v1 keeps **no** `task_baselines` table; this is the single baseline strategy, and no parallel baseline source may be added. When creating a task, the user may enter an initial last-service date and/or meter; store it as a `maintenance_events` row with `source='baseline'`, labeled as an initial baseline in the UI and editable like any event. Baseline rows participate in normal latest-applicable-event selection, so the first real service event automatically supersedes them. A task with neither baseline nor event reports NEEDS_BASELINE.

### `task_presets`

`id`, `name`, `description`, suggested interval fields, `sort_order`, `is_builtin`, `created_at`, `updated_at`.

### `equipment_documents` / `event_attachments`

`id`, owner foreign key, safe stored name, display filename, sniffed MIME, byte length, created timestamp. Never use user-supplied paths directly.

### `sessions` and `app_settings`

Store opaque server-side session tokens in hashed form where practical; idle and absolute expiration; password hash and first-run setup status; theme and warning settings. Avoid storing passwords or secret tokens in plaintext.

### `meter_readings` (reading history — required)

`id`, `equipment_id`, `value` (integer tenths), `mode (increase|confirm|correction)`, `recorded_at`. Every Update Reading, Confirm Same Reading, and Correct Reading action appends a row; equipment `current_meter_value` and `meter_verified_at` mirror the latest accepted entry. Explicit corrections are rows with `mode='correction'` and are never merged into normal increasing readings. Correcting the current reading never rewrites service-event readings.

### Event ordering and calculations

For each task, choose the **latest applicable event by performed service date**, breaking ties between same-date events in this fixed order: highest meter value, then latest created timestamp, then lexicographically greatest id. A corrected or deleted latest event must recompute the task from the remaining latest event or initial baseline. Never select latest solely by database insertion time. Do not silently accept a service record that violates equipment-meter chronology without validation and an explicit correction path.

## 6. UI and information architecture

Mobile-first, responsive, accessible. Light, Dark, Auto themes (Auto default, user choice persisted). Exactly three top-level navigation destinations:

1. **Dashboard:** equipment-grouped due/overdue/soon tasks, Needs Baseline, stale-reading prompts, quick Record Maintenance.
2. **Equipment:** searchable equipment list, add/edit/archive flows; detail with **Tasks | History | Documents | Info** tabs.
3. **Settings:** appearance, master password change, task preset library, warning thresholds, about/version information (authenticated).

### Dashboard

Show overdue first, then due, due soon, unknown baseline, and OK. Show equipment name, task, editable interval summary, last service date and meter (where known), both next due thresholds, signed remaining values, current reading, and urgency explanation. Avoid misleading derived dates based on estimated mileage. Update instantly after a mutation via TanStack Query invalidation.

### Equipment detail — Tasks tab

Each row includes task name, schedule text, last performed, next due, status, and two prominent actions: **Record Maintenance** and **Edit Interval**. Clicking Edit Interval opens a short form in context, not Settings.

### Edit Interval form — mandatory

- Editable positive numeric **every X** meter units if equipment has a meter.
- Editable positive numeric **every X** time units and selection of days, weeks, months, years.
- Independently enable/disable meter and calendar dimensions; ensure at least one remains.
- Preview **old vs new** next due values using last service/baseline, with a clear unknown-state explanation where relevant.
- Save updates the database and visible UI immediately.
- No service history deletion or rewriting.
- Permit user to change values repeatedly (e.g., 5,000 → 3,000 → 7,500 miles).

### Record Maintenance form

Prefill date with today and meter with current equipment reading if available; editable fields include task, date, meter, notes, cost, provider, parts, receipts/photos. Require date and task; meter required when recording service for a meter-based task so its due threshold can be recalculated. For time-only tasks meter is optional. Validate readings without blocking legitimate dated backfills; explain conflicts and offer correction workflow.

### History tab

Newest service dates first; filter by task; edit/delete with confirmation and proper recalculation. Display individual details and attachments. Show how records link to tasks.

### Documents tab

Upload/download/view supported equipment documents; protected behind auth; image preview only for validated safe image types. No untrusted HTML execution.

### Info tab

Name, type, make, model, year, description, meter kind, current meter and last verification. Distinct Update Reading, Confirm Same Reading, and Correct Reading actions.

### Empty and error states

Useful prompts for no equipment, no tasks, unknown baseline, stale readings, validation issues, unsuccessful saves and expired session. Display actual server errors without revealing secrets.

## 7. API contract (illustrative paths)

Use `/api` and Zod schemas; consistent JSON responses and structured errors (`code`, `message`, field errors). API calls require session except setup/login and minimal `/health`.

```text
POST   /api/setup                    # one-time setup; transactional single-row guard
POST   /api/login
POST   /api/logout
GET    /api/session
POST   /api/password/change
GET    /api/equipment              # active only; ?archived=true lists archived
POST   /api/equipment
GET    /api/equipment/:id
PATCH  /api/equipment/:id
DELETE /api/equipment/:id          # explicit hard delete, or use archive
POST   /api/equipment/:id/reading  # update/same/correct with explicit mode
GET    /api/equipment/:id/tasks
POST   /api/equipment/:id/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id               # includes interval editing
DELETE /api/tasks/:id
GET    /api/equipment/:id/events
POST   /api/equipment/:id/events
PATCH  /api/events/:id
DELETE /api/events/:id
GET    /api/dashboard
GET    /api/presets
POST   /api/presets
PATCH  /api/presets/:id
DELETE /api/presets/:id
GET    /api/settings
PATCH  /api/settings
POST   /api/equipment/:id/documents
GET    /api/documents/:id/download
DELETE /api/documents/:id
POST   /api/events/:id/attachments
GET    /api/attachments/:id/download
DELETE /api/attachments/:id
GET    /health                       # no sensitive content
```

Every write must validate authorization/session, input values and foreign-key ownership. Mutations recalculate derived state and invalidate the appropriate UI queries. Handle duplicate submissions where appropriate. Do not create an unauthenticated 'preview' endpoint containing user data. `GET /api/dashboard` excludes archived equipment and disabled tasks while still surfacing Needs Baseline items. `DELETE /api/presets/:id` permanently deletes user presets; built-in presets respond to delete by hiding (soft delete via a `hidden` flag), never hard deletion. No preset create/edit/delete ever modifies existing tasks or schedules.

## 8. Security model: internet-accessible, single user

- First-run page sets one master password; Argon2id salted hash only, enforce a reasonable password minimum. Use Bun's built-in `Bun.password` with `algorithm: "argon2id"` (verified in pinned Bun 1.4.4; the separate `bun:argon2` module does not exist there). Concurrent first-boot setup requests must race against a transactional single-row guard so a password can never be set twice.
- Server-side sessions, random high-entropy IDs, stored hashed where appropriate. Cookie: `__Host-mt_session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` in HTTPS deployment. Because the `__Host-` prefix requires `Secure`, local HTTP development uses a distinct name (`mt_session_dev`) that must never appear in an HTTPS deployment; never accept insecure cookies over public HTTP.
- Idle timeout (configurable, default 30 days) plus absolute maximum lifespan; session revocation on logout or password change. The long idle default is a deliberate single-user home-app tradeoff; state it in the README.
- Login rate-limiting and failure backoff, based on actual client identity only when a known proxy is trusted. Avoid uncontrolled spoofing of `X-Forwarded-*`.
- Verify Origin on state-changing requests and combine with a robust CSRF strategy; reject untrusted cross-site requests.
- Authentication on **all** data endpoints including attachments; minimal non-sensitive `/health` unauthenticated.
- Restrictive CSP, `nosniff`, framing protections, referrer policy, and no-store for private responses.
- Bind service to internal/private Docker network; HTTPS, TLS and HSTS configured by the trusted reverse proxy. Never expose the application directly to the public internet without HTTPS/auth.
- Server-side upload size/type validation via actual MIME sniffing; random safe storage names, no path traversal, no arbitrary HTML/SVG inline execution; documents served as attachments; photos inline only for safe image types.
- Use parameterized queries, Zod input validation, non-root container user, restricted filesystem permissions, environment-only secrets, dependency scanning.
- Public repository: `.gitignore` includes `.env`, `data/`, uploaded documents, runtime database, secrets, logs, and backups. Commit `.env.example` only.
- Password reset must work without email via a documented, explicit local administrative CLI command that revokes existing sessions.
- Perform an unauthenticated endpoint audit in release tests.

## 9. Persistence, startup and migrations

- Database and uploaded files live under configurable `MT_DATA_DIR` backed by a persistent mount.
- SQLite WAL where appropriate; enforce foreign keys; migrations run safely at startup (or controlled migration command), and never discard user tables/data.
- Once any real database is in use, migrations are append-only; **never squash/rewrite applied migrations**.
- Do not erase a volume (`docker compose down -v`) as part of routine deployment instructions.
- Include an explicit manual backup and restore procedure in v1 documentation: use `VACUUM INTO` or `sqlite3 .backup` for a consistent SQLite snapshot — **never copy live WAL-mode files** — plus the uploaded-files directory; quiesce writes only if neither command is available. Automated scheduled backups, rotation and remote GitHub publishing are post-v1, not required to ship core features.
- Use explicit schema validation and migration failure reporting. Failed migrations must not produce a silently partial deployment.

## 10. Configuration and operations

Environment variables (document and validate defaults):

```text
MT_PORT=3000
MT_BIND=0.0.0.0            # within private Docker network only
MT_DATA_DIR=/data
MT_TRUST_PROXY=1           # only with controlled reverse proxy
MT_SESSION_IDLE_DAYS=30
MT_MAX_UPLOAD_MB=10        # server-side upload size limit enforced on every upload
TZ=America/Chicago
```

Set secure proxy/public-origin rules explicitly; do not trust arbitrary forwarded hosts. Log structured server-side events (startup, migrations, auth successes/failures, errors) to stdout for Docker collection; never log passwords, session tokens, or file contents. Provide `compose.yaml`, Dockerfile, `.env.example`, and step-by-step README for local development, Docker build, persistent storage, health check, migrations, Nginx Proxy Manager HTTPS configuration, update and restore.

## 11. Milestones: build vertical slices, not isolated shells

**Repository state:** the previous application was intentionally deleted (commit `4d5054f "starting over"`). Only `.gitignore`, `.dockerignore`, and `.github/workflows/ci.yml` remain; M0 is the true starting point, and `ci.yml` (see §2's binding CI contract) is the M0 acceptance surface.

**M0 — Repository and runnable foundation**
- Scaffold Bun workspaces, server, web, shared and db packages, formatting/lint/typecheck/test scripts, SQLite migrations, CI and Docker Compose.
- Implement the minimal auth slice now — first-run password setup, login/logout, server-side session cookie, route-guard middleware — so every later milestone builds authenticated routes and authenticated tests. Do not defer authentication wholesale.
- Acceptance: first launch loads SPA behind login, public `/health` works, anonymous API requests are rejected, restart retains the database, CI runs.

**M1 — Equipment and meter lifecycle**
- Implement equipment schema, CRUD, meters/confirm/correct appending `meter_readings` history, equipment list and detail UI, tests.
- Acceptance: create an ATV with hours, update its reading, restart, and see persisted value and verification time.

**M2 — Scheduling engine and editable tasks**
- Implement pure engine with date math, tests, task schema/APIs, task list, create/edit/disable/delete, and **Edit Interval** UI.
- Acceptance: a task's intervals can be edited repeatedly and calculated next-due values change immediately without touching history.

**M3 — Maintenance history and baseline**
- Implement service event forms, notes/cost/provider, safe meter/date validation, baseline, history list/filter/edit/delete, and recalculation.
- Acceptance: service at 10,000 mi establishes next 15,000; change interval to 3,000 gives 13,000; service at 13,100 gives 16,100 with both events preserved.

**M4 — Dashboard and task presets**
- Implement real statuses, grouping and ordering, warnings, reading freshness, fast Record Maintenance action, editable preset library and seeded examples.
- Acceptance: dashboard updates immediately on reading change, service event, or interval change.

**M5 — Security hardening and production UI**
- CSRF/Origin verification, login rate limiting and failure backoff, password change with session revocation, idle/absolute session expiry enforcement, full security-header audit, themes, mobile navigation, robust empty/error states. (Baseline authentication itself exists since M0; this milestone hardens it.)
- Acceptance: every data endpoint denies anonymous requests; authenticated workflows work on desktop/mobile.

**M6 — Documents, hardening, and deploy**
- Protected uploads/downloads, file limits, e2e tests, GitHub Actions, public-repo security sweep, Docker production build, NPM proxy documentation, README, manual backups.
- Acceptance: clean installation works behind HTTPS; private data inaccessible anonymously; attachments persist; required test suites green.

**Milestone rule:** Every milestone ends in a runnable app with implemented UI + API + DB + tests. Existing code should be inspected first and milestones marked done only when demonstrated.

## 12. Test plan and release gates

### Unit tests (Bun)

- Miles-only, hours-only and calendar-only tasks.
- Combined meter+calendar with either threshold first; most urgent wins.
- All interval sizes and units; reject zero/negative/invalid settings.
- Interval edits 5,000 → 3,000 → 7,500 without altering history.
- Due-soon boundary at 500 miles, 10 hours, 30 days; due exactly at zero; overdue below zero.
- Decimal meter values (e.g., 127.5 hours) round-trip exactly in tenth-integer storage; DUE at exactly zero from decimal inputs (127.5 + 50 = 177.5).
- Month end, leap day, daylight-saving changes and timezones including UTC, America/Chicago, negative/positive offsets and +14.
- Unknown last-service date/meter, unknown current reading, partial combined baseline, disabled tasks.
- Latest service selection by performed date, backfilled and corrected/deleted events, same-date tie-breaker.
- No unintended cross-equipment preset propagation.

### API tests

- Equipment/task/event CRUD validations, cross-equipment ownership, migration/persistence, atomic edits.
- Auth for every private route, setup only once, session revocation, Origin/CSRF checks, rate limiting.
- Upload abuse: oversized, mismatched MIME, traversal, unsafe extensions, unauthenticated download.
- Correct/equal/decreasing meter-reading modes and the `meter_readings` history they append (increase/confirm/correction).
- Disabling a dimension preserves its stored interval; re-enabling restores the identical schedule.
- Archived equipment excluded from default equipment lists and the dashboard; `?archived=true` lists it.
- Baseline events participate in latest-applicable selection and are superseded by the first real service event; deleting that event falls back to the baseline.

### Critical Playwright end-to-end scenario

1. Log in.
2. Add truck with current reading **12,000 miles**.
3. Create **Oil Change**, **every 5,000 miles**.
4. Record prior oil change on an earlier date at **10,000 miles**.
5. Confirm next due **15,000 miles**.
6. Edit interval to **3,000 miles**; confirm next due **13,000** and history still at **10,000**.
7. Update current reading to **12,600**; confirm **DUE SOON** using 500-mile warning.
8. Update current reading to **13,000**; confirm **DUE**.
9. Update current reading to **13,100**; confirm **OVERDUE**.
10. Record oil change at **13,100**; confirm next due **16,100**.
11. Verify both historical events exist.
12. Change interval again to **4,000 miles**; confirm next due **17,100** without historical edits.
13. Restart server/container; verify persistence and dashboard consistency.

Also test a 100-hour ATV schedule and a combined 5,000-mile/12-month schedule.

### Definition of done

**No 'complete' status** unless all are true:
- User can add multiple equipment types, update meters, create/edit/disable tasks and **change intervals at any time**.
- User can record/correct service history, including dates and meter readings.
- Next due readings/dates and urgency are correct and consistently displayed after every mutation.
- Dashboard and equipment views are coherent on phone/desktop.
- Password/session/CSRF security and attachment access meet requirements.
- Data survives restart and Docker redeploy with persistent volume.
- Typecheck, unit, API, critical e2e, production build and security checks pass.
- README and deployment instructions are usable from a clean checkout.

## 13. Agent execution and checkpoints

**The coding agent must work on implementation, not produce endless plans.** On its first session:
1. Read this entire `build-plan.md`.
2. Inspect actual repository files and Git status; do not presume milestones are already done.
3. Run existing tests/build and document baseline results.
4. Create or update `IMPLEMENTATION_STATUS.md`: completed, incomplete, broken, missing, test status, priority.
5. Create or update `CHECKPOINT.md`: last verified milestone, changed files, commands, decisions, known problems, **single exact next action**.
6. Implement the highest-impact missing vertical slice, connect frontend/API/database, test, update files, commit verified work.
7. Repeat. Do not stop after documentation or claim tests passed unless they ran.

At every significant implementation checkpoint:
- Run targeted tests, typecheck, and build, fixing introduced regressions.
- Record observed results and any remaining blockers.
- Commit tested changes with descriptive messages; never commit `.env`, databases, uploads, keys or personal data.
- Resume future sessions by reading `build-plan.md`, `IMPLEMENTATION_STATUS.md`, and `CHECKPOINT.md` before changing code.

**Agent run instruction:** Continue implementing until a meaningful tested vertical slice is finished, or until an actual blocker exists. If interrupted or context-limited, record exact recovery steps in `CHECKPOINT.md`. Do not redesign established architecture or invent extra requirements as substitutes for working maintenance tracking.

## 14. Decisions intentionally deferred

- Automatic backups and restore UI, backup rotations, GitHub backup pushing.
- PWA/offline access and push notifications.
- 2FA, multi-user access, data import/export, telemetry, OEM service schedule catalogs.
- One-time expiry-date tasks (registrations/warranties) as a separate model, not forced into recurring service logic.

Add these only after the core definition of done has been met.
