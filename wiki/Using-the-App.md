# Using the App

A screen-by-screen guide. The concepts behind everything here are in
[Concepts](Concepts).

## Dashboard

The landing page — every active task across all unarchived equipment,
grouped by urgency: **Overdue → Due now → Due soon → Needs baseline → OK.**
Empty groups are hidden.

Each row: **equipment · task · status badge · schedule summary**
("Next: 16,100 mi · 3,000 mi to go") and a **Record maintenance** button
that opens the service dialog with this equipment and task pre-selected.

A **stale readings** banner lists equipment whose meter hasn't been verified
recently — open those items and update or confirm the reading.

## Equipment list

- Search box filters by name, make, and model.
- **Show archived** checkbox switches to archived equipment.
- **Add equipment**: name (required), meter kind (_Miles / Operating hours /
  No meter_), optional category, make, model, year, description, and the
  current reading. The meter kind locks once readings or meter tasks exist —
  pick carefully.
- Click a card to open its detail page.

## Equipment detail — Tasks tab

Lists every task with its status badge, next-due line, and remaining
amount/days. Per task: **Record maintenance**, **Edit interval**, edit
(pencil), enable/disable, delete.

**New task** dialog:

1. Optionally pick a preset to pre-fill names/intervals.
2. Task name; enable the meter dimension (interval) and/or calendar
   dimension (value + unit days/weeks/months/years).
3. **Baseline** (strongly recommended): date — and meter reading for meter
   kinds — of the last time it was done. Skip it and the task shows
   _Needs baseline_ until the first service is recorded.
4. The dialog shows a **live next-due preview** as you type — you see
   "Next due: 15,000 mi / 2027-01-10" before saving.

**Edit interval** opens the same editor focused on intervals, with a preview
comparing old vs new next-due. Saves apply prospectively; history is never
touched.

## Equipment detail — History tab

All service events newest-first, filterable by task. Each card: date, task
or free label, meter at service, cost, provider, parts, notes, photo
thumbnails (click to view full-size; PDFs download).

- **Record maintenance** (top right) for anything — even tasks that don't
  exist as tasks at all (leave the task blank and type a label).
- Meter-required tasks ask for the reading; unrelated backdated entries are
  allowed — a **warning** appears if a new date precedes the task's last
  recorded service, but saving still works.
- **Edit** fixes any field (recalculation happens automatically); **Delete**
  warns that due dates will be recalculated from the remaining history.

## Equipment detail — Fuel tab

Shown only for **mile-based** equipment (fuel economy isn't meaningful for
hour meters). Log every fill-up — date, odometer reading, gallons, and an
**optional** price per gallon — and the tab computes the rest.

- **Summary cards**: last MPG (most recent interval), blended MPG (whole
  log), total fuel cost with average price, and distance covered.
- **Fill-up list**, newest first, each row showing odometer, gallons,
  price, cost, and an MPG badge when the interval is computable. **Edit**
  or **Delete** any row.
- MPG compares each fill-up's odometer to the previous one — so the first
  fill-up only sets the baseline and shows no MPG. Duplicate or lower
  odometers simply produce no MPG instead of corrupting the math.
- Cost totals count **priced** fill-ups only; unpriced ones still drive
  MPG. Fill-ups never change the equipment's current reading — keep that
  current with the dashboard or Info tab.
- Odometers wildly above the current reading are rejected as fat-finger
  protection; backdated (lower) fill-ups are fine.

## Equipment detail — Documents tab

Upload manuals, receipts, photos: **PNG, JPEG, GIF, WebP, PDF** (checked by
content, not file name — see [Security](Security)). Image documents show
thumbnails; every document can be downloaded or deleted. Files count against
the per-file size limit (`MT_MAX_UPLOAD_MB`).

## Equipment detail — Info tab

- **Details** card: edit name/category/make/model/year/description.
- **Current reading** card (meter kinds only): shows the reading and when it
  was last verified, with **Update reading**, **Confirm same reading**, and
  **Correct reading** (see [Concepts](Concepts#readings-update-confirm-correct)).
  Every reading change is listed in the reading history below.
- **Danger zone**: archive/restore, and **delete equipment** — the
  confirmation lists exactly what cascades away (tasks, events, documents,
  files on disk). Archived items keep everything and can be restored.

## Service dialog (Record maintenance)

Date performed (defaults to today) · task (optional) · meter reading (when
the task needs one) · notes · service provider · cost · parts used ·
**photos** (multiple images attached to the record). Saving a future-dated
or pre-baseline service shows an informational warning but is allowed —
backfilling is a first-class use case.

## Settings

- **Appearance** — auto (follows OS) / light / dark.
- **Warning thresholds** — _Warn within_ distance/hours/days (drives
  Due-soon), and _Stale reading_ age for the dashboard prompt.
- **Task preset library** — edit suggestion names/intervals, add your own,
  hide built-ins. Presets only pre-fill new tasks.
- **Master password** — change requires the current password and **logs all
  sessions out**.
- **About** — app info and the "user-defined intervals" disclaimer.

Next: [Installation](Installation) if you're setting up, or
[Troubleshooting & FAQ](Troubleshooting-and-FAQ) when something's odd.
