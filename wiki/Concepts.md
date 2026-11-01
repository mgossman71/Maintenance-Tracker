# Concepts

Five minutes here makes every screen obvious.

## Equipment and meter kinds

Each piece of **equipment** (truck, mower, boat, generator…) declares how its
wear is measured — the **meter kind**, chosen at creation and locked once
readings or meter-based tasks exist:

| Meter kind | Meaning                        |
| ---------- | ------------------------------ |
| **Miles**  | Vehicles with an odometer      |
| **Hours**  | Machines with an hour meter    |
| **None**   | Calendar-only items (no meter) |

Equipment carries a **current reading** (the odometer/hour-meter value) that
you keep updated manually. Readings are entered to one decimal place
(127.5 h) but stored exactly as integer tenths — no floating-point drift, ever.

## Tasks and schedules

A **task** is a recurring maintenance item on one equipment item:
_"Oil Change every 5,000 miles or 12 months, whichever comes first."_

A task has up to two independent **schedule dimensions**:

- **Meter dimension** — interval in miles/hours (e.g. every 5,000).
- **Calendar dimension** — interval in days/weeks/months/years (e.g. every 12
  months). Months and years clamp correctly (Jan 31 + 1 month → Feb 28/29).

At least one dimension must be enabled. When both are on, the task is due when
**either** dimension is due.

**Presets** are editable suggestions (Oil Change, Tire Rotation, Air Filter…
12 built-ins) that pre-fill the new-task dialog. Changing a preset never
touches existing tasks, and built-ins are hidden rather than deleted.

## Service events and baselines

A **service event** records maintenance actually performed: date, optional
meter reading, cost, provider, parts, notes, photos. Events can be recorded
**in advance** (backfilled with past dates) — history is data you enter, not
something the app has to observe.

When you create a task you may supply a **baseline** — "the last time this was
done was 2026-01-10 at 10,000 miles." A baseline is stored as a special
service event (`source = "baseline"`), so later real events supersede it
naturally. A meter-based task **without** any baseline can't compute a
meter-dimension due date, so it shows **Needs baseline** instead of a
guess. Recording the first service resolves it.

## How due status is computed

Each dimension is evaluated independently, then combined:

1. **Find the last service** — the most recent event for this task (by date;
   same-day ties prefer the one carrying a meter reading, then the newest
   record). No baseline and no events → **Needs baseline**.
2. **Meter dimension** — `next due = last meter + interval`. Remaining is
   `next due − current reading`.
3. **Calendar dimension** — `next due = last date + interval`.
4. **Status per dimension**:

   | State                   | Condition                                                |
   | ----------------------- | -------------------------------------------------------- |
   | **OVERDUE / Due now**   | past the due point, or exactly on it                     |
   | **DUE_SOON / Due soon** | within the warn threshold (settings: miles, hours, days) |
   | **OK**                  | beyond the warn threshold                                |

5. **Overall task status** — the worst dimension wins; disabled tasks drop out
   of the dashboard; a missing baseline for a meter task shows
   **Needs baseline**.

Changing a warn threshold instantly re-colors the dashboard — thresholds are
settings, not stored data.

## Prospective interval changes

Edit an interval any time: the change applies **prospectively** from the last
service event forward. History is never rewritten, and no old record is
reinterpreted. Example — oil at 10,000 mi with a 5,000 interval (due 15,000);
switch to 3,000 and it becomes due at 13,000 immediately, while "last done
2026-01-10 at 10,000 mi" stays exactly as recorded. The task dialog shows a
live preview of the new next-due before you save.

## Readings: update, confirm, correct

Because everything keys off the current reading, keeping it honest matters:

- **Update reading** — new value ≥ current (increases are normal, decreases
  are refused).
- **Confirm same reading** — "still accurate"; resets the stale-reading clock.
- **Correct reading** — deliberate backdated fix (mistyped odometer); the
  value may go down and the change is kept in reading history.

Equipment whose reading hasn't been updated or confirmed for _stale reading
(days)_ (a setting) gets flagged on the dashboard.

## Time and timezones

"Today" for calendar math is computed in the server's `TZ` timezone at
request time; service dates are plain calendar dates (`YYYY-MM-DD`) stored
exactly as entered. Run the container in your real timezone and due dates
flip over at your midnight, not UTC's.

## Data preservation

- **Archive** equipment to get it out of the way (dashboards, pickers) while
  keeping every byte of history; restore any time.
- **Delete** is a deliberate, destructive action: the confirm dialog spells
  out the cascade (tasks, events, attachments, documents, files on disk).
- Deleting a service event recalculates affected tasks from the remaining
  history.

Next: [Using the App](Using-the-App)
