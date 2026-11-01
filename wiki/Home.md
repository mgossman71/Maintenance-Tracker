# Maintenance Tracker Wiki

Self-hosted, single-user vehicle & equipment maintenance tracking with
mileage, hour-meter, and calendar-based service schedules. One password
protects everything — no accounts, no cloud, no telemetry.

> **Disclaimer:** maintenance intervals are user-defined suggestions, never
> manufacturer-approved service schedules. Verify against your owner's manual.

## Pages

### For users

| Page                               | What's in it                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| [Getting Started](Getting-Started) | First launch, master password, UI tour                                  |
| [Concepts](Concepts)               | Equipment, tasks, schedules, statuses, baselines                        |
| [Using the App](Using-the-App)     | Dashboard, equipment, fuel economy, tasks, history, documents, settings |

### For operators

| Page                                             | What's in it                                          |
| ------------------------------------------------ | ----------------------------------------------------- |
| [Installation](Installation)                     | Docker deployment, Nginx Proxy Manager HTTPS, updates |
| [Configuration](Configuration)                   | Every environment variable and its default            |
| [Backup & Recovery](Backup-and-Recovery)         | Snapshots, restore, lost-password reset               |
| [Security](Security)                             | Auth model, sessions, CSRF, upload safety, proxying   |
| [Troubleshooting & FAQ](Troubleshooting-and-FAQ) | Common questions and fixes                            |

### For developers

| Page                           | What's in it                                  |
| ------------------------------ | --------------------------------------------- |
| [Architecture](Architecture)   | Stack, repo layout, data model, status engine |
| [API Reference](API-Reference) | Every endpoint, request/response shapes       |
| [Development](Development)     | Local setup, tests, e2e, CI, conventions      |

## Feature snapshot

- **Equipment** — trucks, cars, mowers, boats, generators… tracked by **miles**,
  **operating hours**, or **calendar only**.
- **Tasks** — "Oil Change every 5,000 miles **or** 12 months." Edit intervals
  any time: recalculation is prospective and never rewrites history.
- **Statuses** — OK / Due soon / Due now / Overdue / Needs baseline, per task,
  aggregated on one dashboard with configurable warning thresholds.
- **History** — every service with date, meter, cost, parts, notes, photos.
  Backfill freely; corrections never destroy data.
- **Documents** — manuals, receipts and photos per equipment item, plus photo
  attachments on service records.
- **Ops** — one Docker container, one volume, healthcheck, migrations on
  startup, Argon2id auth, strict upload validation.

## Tech stack

Bun 1.4.4 · Hono · Drizzle + SQLite (WAL) · React 19 + Tailwind 4 SPA served by
the same process · Playwright for e2e · Biome for lint/format · Zod contracts.

---

_The authoritative specification lives in `build-plan.md` at the repository
root; this wiki is the practical guide._
