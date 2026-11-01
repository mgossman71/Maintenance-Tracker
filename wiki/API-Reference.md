# API Reference

JSON API under `/api/*`. The web SPA uses exactly this surface — anything it
can do, you can script. There is no API key layer: the app is single-user,
so **a session cookie is the only credential** — treat it like a password.

## Conventions

### Wire formats

- **Meter values** (miles/hours) are **integer tenths of the unit** in JSON
  (responses) and **whole numbers of tenths**, string or number, on input:
  `123456` tenths = 12,345.6 mi. `currentMeter`, `meter`, `meterInterval`,
  `nextDueMeter`, `remainingMeter`, `baselineMeter` all follow this. This is
  deliberate — integer math means 10.2 + 0.1 is exactly 10.3.
- **Costs** are integer **cents** (`costCents`).
- **Dates** are `YYYY-MM-DD`; timestamps are ISO-8601 UTC.
- **PATCH semantics**: omitted keys keep their stored values; explicit
  `null` clears a nullable field.

### Authentication

- Login/setup issue a session cookie (`HttpOnly`, `SameSite=Strict`,
  `__Host-mt_session` over HTTPS). Send it on every request.
- **All `/api/*` endpoints require a session** except `POST /api/setup`,
  `POST /api/login`, `GET /api/session` (and `/health`, outside `/api`).
- State-changing requests (`POST/PATCH/DELETE`) are CSRF-checked: include an
  `Origin` header matching the server (browser `fetch` does this for you;
  `curl` users: `-H "Origin: https://your.app"`).

### Errors

Uniform body, non-2xx status:

```json
{
	"error": {
		"code": "not_found",
		"message": "Equipment not found",
		"fields": { "name": "Required" }
	}
}
```

| Status | Meaning                                               |
| ------ | ----------------------------------------------------- |
| `400`  | Malformed request (bad JSON, missing multipart field) |
| `401`  | No/expired session                                    |
| `403`  | CSRF rejection                                        |
| `404`  | Unknown id                                            |
| `409`  | Setup already completed                               |
| `415`  | Upload content type rejected (magic-byte sniffing)    |
| `422`  | Zod validation failure — see `fields`                 |
| `429`  | Login rate-limited (`Retry in Ns` in message)         |

---

## Auth & session

| Method | Path                   | Body → Response                                                                                             |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/setup`           | `{ password }` (≥10 chars) → `201 { ok }`. Only works once ever; `409` after.                               |
| `POST` | `/api/login`           | `{ password }` → `{ ok }` + cookie. `401` invalid; `429` backoff.                                           |
| `POST` | `/api/logout`          | — → `{ ok }`, cookie deleted.                                                                               |
| `GET`  | `/api/session`         | — → `{ authenticated, setupComplete }`. No auth required — the SPA uses it to decide login vs setup screen. |
| `POST` | `/api/password/change` | `{ currentPassword, newPassword }` → `{ ok, message }`. **Revokes all sessions, including yours.**          |

## Equipment

| Method   | Path                 | Notes                                                                                                                              |
| -------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/equipment`     | `?archived=true` lists archived instead of active. → `EquipmentDto[]`                                                              |
| `POST`   | `/api/equipment`     | `{ name, category?, make?, model?, year?, description?, meterKind: "miles"\|"hours"\|"none", currentMeter? }` → `201 EquipmentDto` |
| `GET`    | `/api/equipment/:id` | → `EquipmentDto`                                                                                                                   |
| `PATCH`  | `/api/equipment/:id` | Partial update; `archived: true/false` archives/restores. Changing `meterKind` is rejected once readings or meter tasks exist.     |
| `DELETE` | `/api/equipment/:id` | **Hard delete**: cascades tasks, events, documents, attachments, and removes upload files from disk.                               |

`EquipmentDto`: `id, name, category, make, model, year, description,
meterKind, currentMeter, meterVerifiedAt, archivedAt, createdAt, updatedAt`.

### Readings

| Method | Path                          | Body                                                                                                                                   |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/equipment/:id/readings` | — → `[{ id, value, mode, recordedAt }]` (newest first; `mode` = `increase\|confirm\|correction`)                                       |
| `POST` | `/api/equipment/:id/reading`  | `{ mode: "increase", value }` · `{ mode: "confirm" }` · `{ mode: "correction", value }` → `{ currentMeter, meterVerifiedAt, warning }` |

`increase` must be ≥ current; `correction` may decrease; every call writes
an audit-trail row.

### Tasks & events on an equipment item

| Method   | Path                        | Notes                                                                                                                                                                                                                                                                             |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/equipment/:id/tasks`  | → `[{ task: TaskDto, status: TaskStatusDto }]` — the computed due status lives here.                                                                                                                                                                                              |
| `POST`   | `/api/equipment/:id/tasks`  | `{ name, description?, meterEnabled, meterInterval?, calendarEnabled, calendarValue?, calendarUnit?: "days"\|"weeks"\|"months"\|"years", enabled?, presetId?, baselineDate?, baselineMeter? }` → `201 TaskDto`. Baseline (date and/or meter) becomes a `source:"baseline"` event. |
| `GET`    | `/api/equipment/:id/events` | `?taskId=` filter → `EventDto[]` newest-first, each with `attachments[]`.                                                                                                                                                                                                         |
| `POST`   | `/api/equipment/:id/events` | `{ taskId?, label, performedOn, meter?, notes?, serviceProvider?, costCents?, partsUsed? }` → `201 { event, warning }`. Backdated entries are allowed; `warning` carries non-blocking chronology notes.                                                                           |
| `PATCH`  | `/api/events/:id`           | Partial update → `{ event, warning }`; affected tasks recalculate.                                                                                                                                                                                                                |
| `DELETE` | `/api/events/:id`           | Removes event + attachment files; recalculates.                                                                                                                                                                                                                                   |

`EventDto`: `id, equipmentId, taskId, label, source("service"|"baseline"),
performedOn, meter, notes, serviceProvider, costCents, partsUsed, createdAt,
updatedAt, attachments[]`.

## Tasks (standalone)

| Method   | Path             | Notes                                                                                                                                                                                                                                                 |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/tasks/:id` | → `{ task, status }` — live status for deep links.                                                                                                                                                                                                    |
| `PATCH`  | `/api/tasks/:id` | Same fields as create minus baseline/preset, all optional. **Merge + revalidate**: server merges with stored values and rejects the effective row if a dimension is enabled without its interval. Interval edits are prospective — history untouched. |
| `DELETE` | `/api/tasks/:id` | Cascade-deletes that task's events (general no-task events untouched).                                                                                                                                                                                |

`TaskStatusDto`: `status` (`OK|DUE_SOON|DUE|OVERDUE|NEEDS_BASELINE|DISABLED`),
`disabled`, `driving` (`"meter"|"calendar"|null`), `explanation`,
`lastServiceDate`, `lastServiceMeter`, `scheduleSummary`,
`meter: { enabled, state, nextDueMeter, remainingMeter, unknownReason }`,
`calendar: { enabled, state, nextDueDate, remainingDays, unknownReason }`.

## Dashboard & settings

| Method  | Path             | Notes                                                                                                                                                                                                                                                                        |
| ------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/dashboard` | → `{ groups: [{ status, items: [(TaskStatusDto & { taskName, equipmentName, meterKind, currentMeter })] }], staleReadingEquipment, today }`. Groups follow fixed urgency order (OVERDUE, DUE, DUE_SOON, NEEDS_BASELINE, OK); excludes archived equipment and disabled tasks. |
| `GET`   | `/api/settings`  | → `{ warnMiles, warnHours, warnDays, staleReadingDays }`                                                                                                                                                                                                                     |
| `PATCH` | `/api/settings`  | Any subset of the above → saved settings.                                                                                                                                                                                                                                    |

## Presets

| Method   | Path               | Notes                                                                                                |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/presets`     | `?includeHidden=true` to see soft-deleted builtins. → `PresetDto[]`                                  |
| `POST`   | `/api/presets`     | `{ name, description?, suggestMeterInterval?, suggestCalendarValue?, suggestCalendarUnit? }` → `201` |
| `PATCH`  | `/api/presets/:id` | Partial update.                                                                                      |
| `DELETE` | `/api/presets/:id` | User presets: hard delete. **Builtins: hide** (they become `hidden: true`).                          |

Presets only suggest values in the new-task dialog — editing one never
changes existing tasks.

## Documents & attachments

Upload = `multipart/form-data` with a `file` field (max `MT_MAX_UPLOAD_MB`).
The server sniffs content: allowed types PNG, JPEG, GIF, WebP, PDF; anything
else → `415`.

| Method   | Path                            | Notes                                      |
| -------- | ------------------------------- | ------------------------------------------ |
| `GET`    | `/api/equipment/:id/documents`  | → `DocumentDto[]`                          |
| `POST`   | `/api/equipment/:id/documents`  | multipart → `201 DocumentDto`              |
| `GET`    | `/api/documents/:id/download`   | Bytes. Images `inline`, PDFs `attachment`. |
| `DELETE` | `/api/documents/:id`            | Row + file on disk.                        |
| `POST`   | `/api/events/:id/attachments`   | multipart → `201 AttachmentDto`            |
| `GET`    | `/api/attachments/:id/download` | Bytes, same inline rules.                  |
| `DELETE` | `/api/attachments/:id`          | Row + file.                                |

`DocumentDto`: `id, equipmentId, filename, mimeType, byteLength, createdAt`
(`AttachmentDto` mirrors with `eventId`). `mimeType` is always the
**sniffed** type.

## Health

| Method | Path      | Notes                                                                            |
| ------ | --------- | -------------------------------------------------------------------------------- |
| `GET`  | `/health` | `{ status: "ok", version }` — unauthenticated by design; safe for uptime checks. |

## Scripting example

```bash
BASE=https://mt.example.com
curl -s -c jar -H "Origin: $BASE" -H "content-type: application/json" \
  -d '{"password":"..."}' "$BASE/api/login"

# Add equipment with an odometer at 12,345.6 mi (currentMeter is tenths!)
curl -s -b jar -H "Origin: $BASE" -H "content-type: application/json" \
  -d '{"name":"F-150","meterKind":"miles","currentMeter":"123456"}' \
  "$BASE/api/equipment"

# Upload a PDF manual
curl -s -b jar -H "Origin: $BASE" \
  -F "file=@manual.pdf" "$BASE/api/equipment/$ID/documents"
```
