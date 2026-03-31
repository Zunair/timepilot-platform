# Availability Settings

**Status:** ✅ Complete (March 29, 2026)

## Overview

The admin settings panel includes a comprehensive **Availability Schedule** section for managing booking availability with multiple granularities: hourly, daily, weekly, and monthly.

## Availability Types

| Type | Behaviour |
|------|-----------|
| **Weekly** | Recurring on selected weekdays inside a date range |
| **Daily** | One window per date in range |
| **Monthly** | One window per date in range for broad planning |
| **Hourly** | One exact-time window per date in range |

- Start/end date required; same date = single-day rule
- Weekly type filters by selected weekdays within the range
- Range capped to 90 days per submission

## API Endpoints

```
GET    /api/organizations/{id}/availability        → list all for user
POST   /api/organizations/{id}/availability        → create window
DELETE /api/organizations/{id}/availability/{avId}  → delete rule
```

**POST body:**
```json
{
  "type": "week",
  "startTime": "2026-04-01T13:00:00.000Z",
  "endTime": "2026-04-01T21:00:00.000Z",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "bufferMinutes": 15,
  "timezone": "America/New_York"
}
```

## UI Location

`/admin` → Organisation card → **Settings** → "Availability schedule" section.

### Form Fields

- **Type** dropdown (Week / Day / Month / Hour)
- **Start date** / **End date** pickers
- **Start time** / **End time** pickers
- **Days of week** checkboxes (weekly type only)
- **Buffer time** (0–480 min)

### Table Columns

Type badge · Human-readable schedule · Delete action

## User Guide

1. Navigate to `/admin` → click **Settings** on the org card
2. Scroll to **Availability schedule**
3. Fill the form (weekly recurring recommended for most cases)
4. Click **+ Add availability** — success message appears, table refreshes
5. To remove a rule, click **Delete** on that row

**Tips:**
- Use weekly for recurring hours (e.g., 9–5 Mon–Fri for 60 days)
- Set start = end date for a single-day rule
- Set 15–30 min buffer for consultation-heavy work
- Timezone auto-detected from user profile

## Implementation

### Files Modified
- `src/client.ts` — ~500 lines: form UI, table display, event handlers, API integration
- `docs/todo/TODO.Phase1.md` — completion markers

### Client State
12 new state variables manage form fields, loading, errors, and the availability list. Data flow: form submit → validation → POST → update state → re-render table → auto-reset form.

### Validation
- Required fields, logical time range, IANA timezone (server-validated)
- Day-of-week required for weekly type
- Buffer range 0–480 min

## Known Limitations

1. Edit uses delete-and-recreate (no inline edit yet)
2. No overlap detection when creating new rules
3. Native browser time picker only
4. Single-user availability (team availability planned for later phases)
