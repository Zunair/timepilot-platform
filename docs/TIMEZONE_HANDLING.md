# TimePilot Timezone Handling

How TimePilot stores, converts, and displays times across the scheduling lifecycle.

---

## Core Principle

**All timestamps are stored in UTC.** Timezone context is stored alongside times for presentation and auditing, but never affects storage.

```
Storage:    2026-06-15T14:00:00.000Z       (UTC, always)
Context:    America/New_York                (IANA identifier, metadata only)
Display:    June 15, 2026 at 10:00 AM EDT  (computed at render time)
```

---

## Why UTC-Only Storage

| Concern | How UTC Solves It |
|---------|-------------------|
| Overlap detection | Compare UTC ranges directly — no conversion needed |
| DST transitions | UTC has no DST; local rendering handles display |
| Multi-timezone teams | One canonical time; each viewer sees their own local time |
| Audit trail | Unambiguous timestamps in logs and DB |
| Database queries | Simple range queries without timezone arithmetic |

---

## Architecture Layers

### 1. Client Layer (browser)

**Timezone detection:**
```javascript
Intl.DateTimeFormat().resolvedOptions().timeZone  // e.g. "America/New_York"
```

**What the client does:**
- Detects the user's browser timezone automatically
- Displays all times in the detected timezone
- Sends `timezone` field with every booking request
- Converts local slot selections to UTC before submitting

**Key functions in `src/client.ts`:**
- `fmtTime(utcIso)` — format UTC to local time string
- `fmtDate(utcIso)` — format UTC to local date string
- `localYMD(date)` — get YYYY-MM-DD in user's timezone
- `convertLocalToUTC(date, time, tz)` — iterative Intl-based conversion

### 2. API Layer (routes)

**What routes do:**
- Accept `timezone` as a required parameter on slot queries and bookings
- Pass timezone through to services without modification
- Never perform timezone conversion themselves

**Slot query example:**
```
GET /api/organizations/:orgId/slots?userId=...&date=2026-06-15&timezone=America/New_York&duration=30
```

The `date` parameter is in the client's local calendar date. The server converts it to a UTC search range using ±14h padding to cover all possible IANA offsets.

### 3. Service Layer

**SchedulingService:**
- Converts the client's local date to a UTC search range
- Filters availability windows by day-of-week in the requested timezone
- Generates candidate slots in UTC
- Filters out conflicts (existing appointments + time blocks)
- Filters generated slots to the client's local date (prevents date-leak across midnight boundaries)

**AppointmentService:**
- Stores `startTime`, `endTime` in UTC
- Stores `timezone` as metadata for notifications and display
- Validates slot availability at booking time (optimistic concurrency)

### 4. Notification Layer

**NotificationWorker `buildTemplateVariables()`:**
```typescript
new Date(appointment.startTime).toLocaleDateString('en-US', {
  timeZone: appointment.timezone,
  dateStyle: 'full',
});
new Date(appointment.startTime).toLocaleTimeString('en-US', {
  timeZone: appointment.timezone,
  timeStyle: 'short',
});
```

Emails and SMS messages render times in the appointment's stored timezone so the client sees the same time they selected during booking.

### 5. Utility Layer (`src/utils/timezone.ts`)

All timezone conversions go through a dedicated utility module that uses the Intl API exclusively (no third-party timezone libraries).

| Function | Purpose |
|----------|---------|
| `getDayOfWeekInTimezone(utcIso, tz)` | Local day-of-week for availability filtering |
| `formatInTimezone(utcIso, tz, opts)` | General-purpose display formatting |
| `getLocalDateInTimezone(utcIso, tz)` | YYYY-MM-DD in local timezone |
| `getLocalTimeInTimezone(utcIso, tz)` | HH:mm in local timezone |
| `localDateToUTCSearchRange(localDate)` | ±14h UTC window for a local calendar date |
| `localDateTimeInTimezoneToUTC(date, time, tz)` | Convert local date+time to UTC (iterative correction) |
| `isValidTimezone(tz)` | Validate IANA identifier |
| `addMinutes(utcIso, minutes)` | Arithmetic on UTC timestamps |
| `rangesOverlap(startA, endA, startB, endB)` | Half-open interval overlap check |

---

## DST Safety

### How DST Is Handled

The Intl API (built into Node.js and browsers) uses the IANA timezone database, which includes all historical and current DST rules. TimePilot never manually calculates offsets.

### Spring Forward (Clocks Skip Ahead)

**Example:** US Eastern, March 8 2026 — 2:00 AM jumps to 3:00 AM.

- **Booking at 10:00 AM EDT:** Stored as `14:00 UTC`. Renders correctly as `10:00 AM`.
- **Booking at 1:30 AM EST (before transition):** Stored as `06:30 UTC`. Renders as `1:30 AM`.
- **Booking at 3:00 AM EDT (after transition):** Stored as `07:00 UTC`. Renders as `3:00 AM`.
- **2:30 AM (non-existent time):** `localDateTimeInTimezoneToUTC` uses iterative correction and resolves to the nearest valid representation.

### Fall Back (Clocks Repeat)

**Example:** US Eastern, November 1 2026 — 2:00 AM falls back to 1:00 AM.

- **1:30 AM occurs twice** (once in EDT, once in EST). The UTC timestamp disambiguates:
  - `05:30 UTC` = 1:30 AM EDT (first occurrence)
  - `06:30 UTC` = 1:30 AM EST (second occurrence)
- Both display as `1:30 AM` to the client, but the UTC value ensures correct ordering and no scheduling conflicts.

### Key Design Decisions

1. **No manual offset tables.** All conversions use `Intl.DateTimeFormat` with explicit `timeZone` option.
2. **±14h search padding.** The widest IANA offset is UTC+14 (Line Islands). Padding ensures full local-day coverage regardless of timezone.
3. **Iterative UTC conversion.** `localDateTimeInTimezoneToUTC` makes up to 3 correction passes via Intl formatting to converge on the correct UTC value, even across DST boundaries.
4. **Date-leak prevention.** Slot generation filters results to the client's requested local date, preventing slots from adjacent UTC dates from appearing.

---

## Database Schema

All time columns use `TIMESTAMPTZ` (PostgreSQL stores as UTC internally):

```sql
-- appointments table
start_time    TIMESTAMPTZ NOT NULL,  -- UTC
end_time      TIMESTAMPTZ NOT NULL,  -- UTC
timezone      TEXT NOT NULL,          -- IANA identifier (metadata)
created_at    TIMESTAMPTZ DEFAULT NOW(),
updated_at    TIMESTAMPTZ DEFAULT NOW(),
cancelled_at  TIMESTAMPTZ,

-- availability table
start_time    TIMESTAMPTZ NOT NULL,
end_time      TIMESTAMPTZ NOT NULL,
timezone      TEXT NOT NULL,

-- notifications table
next_retry_at TIMESTAMPTZ,
sent_at       TIMESTAMPTZ,
```

---

## Testing

Timezone correctness is verified at multiple levels:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `timezone.test.ts` | 23 | Utility functions: day-of-week, formatting, range overlap, DST boundary, local↔UTC conversion |
| `timezone-system-wide.test.ts` | 24 | Cross-layer: UTC storage invariant, template rendering across 7 timezones, scheduling correctness, spring-forward/fall-back DST transitions, round-trip consistency |

**Total: 47 timezone-specific tests.**

---

## Quick Reference

| Question | Answer |
|----------|--------|
| What timezone are DB times in? | Always UTC |
| Where is timezone stored? | `timezone` column on appointments, availability, time blocks |
| What library handles conversions? | Built-in `Intl` API (Node.js + browser) |
| How are notifications rendered? | In the appointment's stored timezone |
| How are slots displayed to clients? | In the browser's detected timezone |
| What happens during DST? | Intl API resolves automatically; UTC storage is unambiguous |
