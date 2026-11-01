# Getting Started

## What you need

A single machine that can run Docker (recommended), or [Bun](https://bun.sh)
1.4.4 for local development. All persistent state — the SQLite database and
uploaded files — lives in one directory (`MT_DATA_DIR`), so backups and moves
are trivial.

## First launch (Docker)

```bash
git clone https://github.com/mgossman71/Maintenance-Tracker.git
cd Maintenance-Tracker
cp .env.example .env          # defaults work; TZ and MT_DATA_DIR are the usual tweaks
docker compose up -d --build
```

Open `http://localhost:3000`. The app answers `{"status":"ok"}` at
`http://localhost:3000/health`.

## First launch (development)

```bash
bun install
bun run dev        # server on :3000, Vite on :5173 (proxies /api) — open :5173
```

## Setting the master password

On the very first visit the login screen becomes a setup screen: enter and
confirm a master password of **at least 10 characters**. There are no user
accounts — this one password unlocks everything, and it is stored only as an
Argon2id hash. If you lose it, see
[Backup & Recovery → Lost password](Backup-and-Recovery#lost-password).

Once set, the app shows the **Dashboard** — the rest of the tour assumes you
are looking at it.

## UI tour

- **Top bar** — app name (→ Dashboard), nav links: **Dashboard**, **Equipment**,
  **Fuel**, **Settings**; a theme toggle (auto/light/dark); **Log out**.
  Collapses to a bottom tab bar on small screens.
- **Dashboard** — one card per vehicle with all of its tasks inside; cards
  sort by urgency (anything Overdue first, all-OK equipment last). Each task
  row shows status · a one-line schedule summary ("next due 16,100 mi · in
  3,000 mi") and a **Record service** button opening the service dialog
  pre-filled for that task. One **Update reading** button per card; stale
  readings are flagged inline on the card.
- **Equipment list** (`/equipment`) — searchable, with archive filter and an
  **Add equipment** button. Categories group items (Truck, Car, Lawn… whatever
  you type).
- **Equipment detail** — tabs:
  - **Tasks** — each task with status badge, next-due line, and actions
    (_Record maintenance_, _Edit interval_, edit, disable/enable, delete).
    **New task** opens a dialog with a live next-due preview.
  - **History** — all service events newest-first, filterable by task, with
    photos/costs/parts and edit & delete.
  - **Fuel** (mile-based equipment only) — fill-up log with MPG badges, trend
    row, and cost totals.
  - **Documents** — upload manuals/receipts/photos (PNG, JPEG, GIF, WebP,
    PDF), preview, download, delete.
  - **Info** — edit metadata, current-reading panel with **Update reading** /
    **Confirm same reading**, meter history, archive/delete.
- **Settings** (`/settings`) — warning thresholds (miles, hours, days), stale-
  reading prompt age, preset task library, change master password, appearance.

## A quick first week

1. Add your truck with its current odometer reading
   (**Equipment → Add equipment → Tracks: Miles**).
2. Create a task (**New task → Oil Change, every 5,000 miles**), and enter the
   date/mileage of the last oil change as the **baseline** — or skip it and
   record the previous service later via **Record maintenance**.
3. Keep the odometer honest: when you fill up, use **Update reading** in the
   Info tab; use **Confirm same reading** to say "still accurate" without
   changing the number.
4. When you actually do the service, **Record maintenance** with the mileage
   it was done at. Next-due recalculates from that event.

Next: [Concepts](Concepts) explains how due dates are computed — five minutes
that make everything else obvious.
