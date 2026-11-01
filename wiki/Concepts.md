# Concepts

Five minutes here makes every screen obvious.

## Equipment and meters

Each piece of **equipment** (truck, mower, boat, generator…) declares which
**meters** it carries — a mile meter, an hour meter, both, or neither. A diesel
pickup with an engine-hour meter tracks 12,000 mi **and** 340 h side by side;
a generator just counts hours; a trailer counts nothing (calendar-only).

Each meter has its own **current reading** and **last-verified** timestamp.
Readings are entered to one decimal place (127.5 h) but stored exactly as
integer tenths — no floating-point drift, ever.

Adding a meter is always safe (its reading simply starts empty). Removing one
is refused while any reading, service record, task interval, or fuel log still
references that unit — history can't be orphaned.

## Tasks and schedules

A **task** is a recurring maintenance item on one equipment item:
_"Change oil every 5,000 miles **or** 250 hours **or** 12 months, whichever
comes first."_

A task has up to three independent **schedule dimensions**, each enabled
independently:

- **Miles dimension** — interval in miles (e.g. every 5,000).
- **Hours dimension** — interval in hours (e.g. every 250).
- **Calendar dimension** — interval in days/weeks/months/years (e.g. every 12
  months). Months and years clamp correctly (Jan 31 + 1 month → Feb 28/29).

At least one dimension must be enabled, and a dimension can only be enabled if
the equipment actually carries that meter. The task is due when **whichever**
dimension comes due **first** — that dimension drives the badge.

**Presets** are editable suggestions (Oil Change, Tire Rotation, Air Filter…
12 built-ins) that pre-fill the new-task dialog. Presets carry one suggested
meter interval, which lands on the equipment's primary meter (miles when it
has one). Changing a preset never touches existing tasks, and built-ins are
hidden rather than deleted.

## Service events and baselines

A **service event** records maintenance actually performed: date, optional
per-meter readings (miles at service, hours at service), cost, provider,
parts, notes, photos. Events can be recorded **in advance** (backfilled with
past dates) — history is data you enter, not something the app has to observe.

Each clock resets from **its own reading**: a service that captures both
numbers restarts both intervals; one that captures only miles leaves the hours
clock where it was (the app warns you, but never blocks the record). Clearing
a reading you didn't take is honest bookkeeping, not an error.

When you create a task you may supply a **baseline** — "the last time this was
done was 2026-01-10 at 10,000 miles and 260 hours." A baseline is stored as a
special service event (`source = "baseline"`), so later real events supersede
it naturally. A task dimension **without** any baseline reading for it can't
compute a due point, so it shows **Needs baseline** instead of a guess.
Recording service with that reading resolves it.

## How due status is computed

Each dimension is evaluated independently, then combined:

1. **Find each dimension's last service** — the most recent event that
   captured **that dimension's** reading (miles from mile readings, hours from
   hour readings, calendar from any event's date; same-day ties prefer the
   newest record). Nothing found for a dimension → **Needs baseline**.
2. **Meter dimensions** — `next due = last service reading + interval`.
   Remaining is `next due − current reading`.
3. **Calendar dimension** — `next due = last date + interval`.
4. **Status per dimension**:

   | State                   | Condition                                                |
   | ----------------------- | -------------------------------------------------------- |
   | **OVERDUE / Due now**   | past the due point, or exactly on it                     |
   | **DUE_SOON / Due soon** | within the warn threshold (settings: miles, hours, days) |
   | **OK**                  | beyond the warn threshold                                |

5. **Overall task status** — the worst dimension wins (an overdue hour clock
   makes the whole task overdue even when miles are fine); disabled tasks drop
   out of the dashboard; a dimension with no baseline shows
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

Because everything keys off the current readings, keeping them honest matters.
Each meter (miles, hours) is maintained independently:

- **Update reading** — new value ≥ current (increases are normal, decreases
  are refused).
- **Confirm same reading** — "still accurate"; resets the stale-reading clock.
- **Correct reading** — deliberate backdated fix (mistyped odometer); the
  value may go down and the change is kept in reading history.

Equipment whose reading hasn't been updated or confirmed for _stale reading
(days)_ (a setting) gets flagged on the dashboard — naming which meter (miles,
hours, or both) went stale.

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
