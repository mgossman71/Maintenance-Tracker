# Using the App

A screen-by-screen guide. The concepts behind everything here are in
[Concepts](Concepts).

## Dashboard

The landing page — **one card per vehicle or piece of equipment**, with all
of its tracked tasks inside. Cards sort by urgency: a vehicle shows up as
soon as anything on it is **Overdue**, then Due now, Due soon, Needs
baseline, and all-OK equipment settles at the bottom. Equipment with no
tasks still gets a card (marked _Untracked_) so nothing is invisible here.

Each card: **name (link), worst-status badge, current readings**, then one
row per task — **task · status badge · schedule summary** ("Next: 16,100
mi · 3,000 mi to go") with a **Record service** button that opens the
service dialog with that task pre-selected. Two-meter machines show both
readings ("12,345.6 mi · 340.0 h"). Cards containing overdue work get a red
border so problems pop out at a glance.

One **Update reading** button per card opens the quick dialog (a field for
each meter the machine carries); if a reading looks stale, the card says so
inline, naming which meter.

## Equipment list

- Search box filters by name, make, and model.
- **Show archived** checkbox switches to archived equipment.
- **Add equipment**: name (required), **Tracks** checkboxes (_Miles_ and/or
  _Hours_; leave both off for calendar-only), optional category, make, model,
  year, description, and the current reading(s). You can add a meter later
  (its reading just starts empty); removing one is refused while history or
  tasks still use it.
- Click a card to open its detail page.

## Equipment detail — Tasks tab

Lists every task with its status badge, next-due line, and remaining
amount/days. Per task: **Record maintenance**, **Edit interval**, edit
(pencil), enable/disable, delete.

**New task** dialog:

1. Optionally pick a preset to pre-fill names/intervals.
2. Task name; enable any of the **miles**, **hours**, and **calendar**
   dimensions (only the meters this machine carries are offered), each with
   its own interval.
3. **Baseline** (strongly recommended): date — plus last miles and/or last
   hours, whichever you know — of the last time it was done. Skip it and a
   dimension without a baseline reading shows _Needs baseline_ until the
   first service is recorded.
4. The dialog shows a **live next-due preview** as you type — every enabled
   dimension ("1,500 mi (500 left) or 290 h (50 over)") before saving. The
   task becomes due when whichever comes **first**.

**Edit interval** opens the same editor focused on intervals, with a preview
comparing old vs new next-due. Saves apply prospectively; history is never
touched.

## Equipment detail — History tab

All service events newest-first, filterable by task. Each card: date, task
or free label, miles and/or hours at service, cost, provider, parts, notes,
photo thumbnails (click to view full-size; PDFs download).

- **Record maintenance** (top right) for anything — even tasks that don't
  exist as tasks at all (leave the task blank and type a label).
- Meter-required tasks ask for the reading; unrelated backdated entries are
  allowed — a **warning** appears if a new date precedes the task's last
  recorded service, but saving still works.
- **Edit** fixes any field (recalculation happens automatically); **Delete**
  warns that due dates will be recalculated from the remaining history.

## Fuel page

A dedicated nav entry (bottom bar on mobile, header links on desktop) for
grab-and-go logging: one card per **mile-based** vehicle with its odometer,
last MPG, blended MPG and total fuel cost — each with an **Add fill-up**
button that opens the dialog right there. Nothing to navigate through;
hour-based equipment doesn't appear. The vehicle's own Fuel tab (below)
adds the full fill-up history with edit/delete.

## Equipment detail — Fuel tab

Shown only for **mile-based** equipment (fuel economy isn't meaningful for
hour meters). Log every fill-up — date, odometer reading, gallons, and an
**optional** price per gallon — and the tab computes the rest.

- **Summary cards**: last MPG (most recent interval), blended MPG (whole
  log), total fuel cost with average price, and distance covered.
- **Trend row**: your last three fill-up intervals vs the average of all
  earlier ones — ▲ up / ▼ down / holding steady — plus the best and worst
  single intervals and their dates. Needs at least four intervals with
  computable MPG so the baseline never overlaps what it's compared to.
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

- **Details** card: edit name/category/make/model/year/description, plus each
  meter's current reading and when it was last verified.
- **One meter card per meter** the machine carries (Mile meter, Hour meter):
  its reading, verified date, and **Update reading**, **Confirm same
  reading**, and **Correct reading** (see
  [Concepts](Concepts#readings-update-confirm-correct)).
  Every reading change is tagged with its meter in the reading history.
- **Danger zone**: archive/restore, and **delete equipment** — the
  confirmation lists exactly what cascades away (tasks, events, documents,
  files on disk). Archived items keep everything and can be restored.

## Service dialog (Record maintenance)

Date performed (defaults to today) · task (optional) · **miles at service**
and/or **hours at service**, prefilled from the current readings — clear one
to leave that schedule where it is (the app warns you it won't advance) ·
notes · service provider · cost · parts used · **photos** (multiple images
attached to the record). Saving a future-dated or pre-baseline service shows
an informational warning but is allowed — backfilling is a first-class use
case.

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
