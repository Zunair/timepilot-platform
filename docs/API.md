# TimePilot API Reference

Complete HTTP API reference for the TimePilot scheduling platform.

> **Base URL:** `http://localhost:3000` (development) or your deployed API host.
>
> **Authentication:** Cookie-based sessions via OAuth 2.0. Include the session cookie in all authenticated requests.
>
> **Tenant context:** Authenticated endpoints require a valid `organizationId` path parameter matching the user's active session.

For admin-specific endpoints (dashboard, settings, team management), see [ADMIN_API.md](ADMIN_API.md).

---

## Table of Contents

- [Error Format](#error-format)
- [Public Endpoints](#public-endpoints)
  - [Health Check](#health-check)
  - [Available Slots](#available-slots)
  - [Book Appointment](#book-appointment)
  - [Confirm Appointment](#confirm-appointment)
  - [Booking Link Resolve](#booking-link-resolve)
  - [Booking Link QR Code](#booking-link-qr-code)
  - [Organization Lookup](#organization-lookup)
  - [User Public Profile](#user-public-profile)
  - [OAuth Providers](#oauth-providers)
- [Authentication](#authentication)
  - [Session Check](#session-check)
  - [Google OAuth](#google-oauth)
  - [Apple OAuth](#apple-oauth)
  - [Microsoft OAuth](#microsoft-oauth)
  - [Token Refresh](#token-refresh)
  - [Enable Email Scope (Google)](#enable-email-scope-google)
  - [Enable Email Scope (Microsoft)](#enable-email-scope-microsoft)
  - [Organization Create](#organization-create)
  - [Organization Select](#organization-select)
  - [Organization List](#organization-list)
  - [Logout](#logout)
  - [Dev Login](#dev-login)
- [Appointments](#appointments)
  - [List Appointments](#list-appointments)
  - [Get Appointment](#get-appointment)
  - [Update Appointment](#update-appointment)
  - [Cancel Appointment](#cancel-appointment)
  - [Reschedule Appointment](#reschedule-appointment)
- [Availability](#availability)
  - [List Availability](#list-availability)
  - [Create Availability](#create-availability)
  - [Delete Availability](#delete-availability)
- [Time Blocks](#time-blocks)
  - [List Time Blocks](#list-time-blocks)
  - [Create Time Block](#create-time-block)
  - [Delete Time Block](#delete-time-block)
- [Booking Links](#booking-links)
  - [Create Booking Link](#create-booking-link)
  - [List Booking Links](#list-booking-links)
  - [Delete Booking Link](#delete-booking-link)
- [Email Templates](#email-templates)
  - [List Templates](#list-templates)
  - [Get Template](#get-template)
  - [Create/Update Template](#createupdate-template)
  - [Delete Template](#delete-template)
  - [Preview Template](#preview-template)
- [User Profile](#user-profile)
  - [Get My Profile](#get-my-profile)
  - [Update My Profile](#update-my-profile)

---

## Error Format

All error responses follow a consistent structure:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

| Status | Meaning |
|--------|---------|
| `200` | Success (GET, PATCH, PUT) |
| `201` | Created (POST) |
| `204` | No Content (DELETE) |
| `400` | Bad Request — missing or invalid parameters |
| `403` | Forbidden — insufficient role or wrong tenant |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — slot no longer available (double-booking) |
| `500` | Internal Server Error |

---

## Public Endpoints

These endpoints require no authentication.

### Health Check

```
GET /health
```

**Response (200):**
```json
{ "status": "ok", "timestamp": "2026-03-31T12:00:00.000Z" }
```

### Available Slots

```
GET /api/organizations/:organizationId/slots
```

Returns available booking slots for a specific user, date, and duration.

| Query Param | Type | Required | Description |
|-------------|------|----------|-------------|
| `userId` | UUID | Yes | The team member to book with |
| `date` | `YYYY-MM-DD` | Yes | Calendar date in the client's timezone |
| `timezone` | string | Yes | IANA timezone (e.g. `America/New_York`) |
| `duration` | number | Yes | Slot duration in minutes (15–480) |

**Response (200):**
```json
{
  "slots": [
    {
      "startTime": "2026-04-01T14:00:00.000Z",
      "endTime": "2026-04-01T14:30:00.000Z"
    }
  ]
}
```

Slots are returned in UTC. The client converts to local display time using the requested timezone.

**Errors:**
- `400` — Missing required query params or invalid duration range

### Book Appointment

```
POST /api/organizations/:organizationId/appointments
```

Book an appointment slot. The slot must still be available at the time of booking (optimistic concurrency check).

**Request Body:**
```json
{
  "userId": "user-uuid",
  "clientName": "Jane Smith",
  "clientEmail": "jane@example.com",
  "clientPhone": "+1-555-0123",
  "startTime": "2026-04-01T14:00:00.000Z",
  "endTime": "2026-04-01T14:30:00.000Z",
  "timezone": "America/New_York",
  "notes": "First consultation"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `userId` | UUID | Yes | Team member to book with |
| `clientName` | string | Yes | Client's display name |
| `clientEmail` | string | Yes | Client's email (receives confirmation) |
| `clientPhone` | string | No | Client phone (for SMS notifications) |
| `startTime` | ISO 8601 | Yes | UTC start time |
| `endTime` | ISO 8601 | Yes | UTC end time |
| `timezone` | string | Yes | IANA timezone |
| `notes` | string | No | Optional booking notes |

**Response (201):**
```json
{
  "id": "appt-uuid",
  "organizationId": "org-uuid",
  "userId": "user-uuid",
  "clientName": "Jane Smith",
  "clientEmail": "jane@example.com",
  "status": "scheduled",
  "startTime": "2026-04-01T14:00:00.000Z",
  "endTime": "2026-04-01T14:30:00.000Z",
  "timezone": "America/New_York",
  "confirmationRef": "TP-A1B2C3",
  "createdAt": "2026-03-31T10:00:00.000Z"
}
```

**Side Effects:**
- A `booking_confirmation` notification is enqueued (fire-and-forget — booking succeeds even if notification enqueue fails)

**Errors:**
- `400` — Missing required fields
- `409` — Slot no longer available (double-booking)

### Confirm Appointment

```
GET /api/appointments/confirm/:ref
```

Look up an appointment by its public confirmation reference code. Returns client-safe fields only.

**Response (200):**
```json
{
  "id": "appt-uuid",
  "clientName": "Jane Smith",
  "clientEmail": "jane@example.com",
  "status": "scheduled",
  "startTime": "2026-04-01T14:00:00.000Z",
  "endTime": "2026-04-01T14:30:00.000Z",
  "timezone": "America/New_York",
  "confirmationRef": "TP-A1B2C3"
}
```

**Errors:**
- `404` — No appointment with that reference

### Booking Link Resolve

```
GET /api/b/:token
```

Resolve an opaque booking link token to the organization and user it targets.

**Response (200):**
```json
{
  "organizationSlug": "acme",
  "userId": "user-uuid"
}
```

**Errors:**
- `404` — Token not found or deactivated

### Booking Link QR Code

```
GET /api/b/:token/qr
```

Generate an inline SVG QR code for a booking link.

**Response (200):** `Content-Type: image/svg+xml`

**Errors:**
- `404` — Token not found or deactivated

### Organization Lookup

```
GET /api/organizations/slug/:slug
```

Look up an organization by slug. Returns public-safe fields only (id, name, slug, branding).

**Response (200):**
```json
{
  "id": "org-uuid",
  "name": "Acme Studio",
  "slug": "acme",
  "logoUrl": "https://...",
  "primaryColor": "#0f766e",
  "secondaryColor": "#d1faf3",
  "fontFamily": "Georgia"
}
```

**Errors:**
- `404` — No organization with that slug

### User Public Profile

```
GET /api/users/:userId
```

Returns public-safe fields only (no email, timezone, or timestamps).

**Response (200):**
```json
{
  "id": "user-uuid",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://..."
}
```

**Errors:**
- `404` — User not found

### OAuth Providers

```
GET /api/auth/providers
```

Returns which OAuth providers are configured and available.

**Response (200):**
```json
{
  "google": true,
  "apple": true,
  "microsoft": true
}
```

---

## Authentication

### Session Check

```
GET /api/auth/session
```

Returns the current user/organization if the session cookie is valid.

**Response (200):** User and organization objects, or `401` if no valid session.

### Google OAuth

```
GET /api/auth/google/callback?code=...&state=...
```

Google OAuth 2.0 callback. Exchanges authorization code for tokens, creates or retrieves user, establishes session, and redirects to the client.

### Apple OAuth

```
GET /api/auth/apple/callback?code=...&state=...
POST /api/auth/apple/callback  (form_post response mode)
```

Apple Sign-In callback. POST variant supports Apple's `form_post` response mode.

### Microsoft OAuth

```
GET /api/auth/microsoft/callback?code=...&state=...
```

Microsoft OAuth 2.0 callback. Exchanges authorization code for tokens.

### Token Refresh

```
POST /api/auth/providers/:provider/refresh
```

Refresh an expired OAuth access token. Provider must be `google`, `apple`, or `microsoft`.

**Auth:** Requires session cookie.

**Response (200):**
```json
{ "message": "Token refreshed" }
```

**Errors:**
- `400` — No refresh token stored for this provider
- `404` — No OAuth account found

### Enable Email Scope (Google)

```
GET /api/auth/providers/google/status
```

Check if Gmail send scope is granted for the current user.

**Response (200):**
```json
{ "emailScopeGranted": true }
```

```
GET /api/auth/google/enable-email-scope?returnTo=/admin
```

Start incremental Google consent to add `gmail.send` scope. Redirects to Google.

### Enable Email Scope (Microsoft)

```
GET /api/auth/microsoft/email-scope-status
```

Check if Microsoft Mail.Send scope is granted.

```
GET /api/auth/microsoft/enable-email-scope?returnTo=/admin
```

Start incremental Microsoft consent for Mail.Send scope.

### Organization Create

```
POST /api/auth/organizations/create
```

Create a new organization. Generates default 14-day availability.

**Auth:** Requires session cookie.

**Request Body:**
```json
{
  "name": "My Studio",
  "timezone": "America/New_York"
}
```

**Response (201):** Organization object with generated slug.

### Organization Select

```
POST /api/auth/organizations/select
```

Switch the active organization for the current session.

**Auth:** Requires session cookie.

**Request Body:**
```json
{ "organizationId": "org-uuid" }
```

### Organization List

```
GET /api/auth/organizations
```

List all organizations the logged-in user belongs to.

**Auth:** Requires session cookie.

**Response (200):** Array of organization objects.

### Logout

```
POST /api/auth/logout
GET  /api/auth/logout
```

Revoke the current session and clear the session cookie. Both methods supported.

### Dev Login

```
POST /api/auth/dev-login
```

**Development only.** Create a session without OAuth for local testing.

**Request Body:**
```json
{
  "email": "demo@acme.com",
  "organizationSlug": "acme"
}
```

---

## Appointments

All appointment management endpoints require authentication and tenant context.

### List Appointments

```
GET /api/organizations/:organizationId/appointments
```

**Auth:** Owner, Admin, or Member

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `status` | string | — | Filter by status (`scheduled`, `completed`, `cancelled`) |
| `limit` | number | 50 | Max results |
| `offset` | number | 0 | Pagination offset |

**Response (200):** Array of appointment objects.

### Get Appointment

```
GET /api/organizations/:organizationId/appointments/:id
```

**Auth:** Owner, Admin, or Member

**Response (200):** Full appointment object.

### Update Appointment

```
PATCH /api/organizations/:organizationId/appointments/:id
```

**Auth:** Owner, Admin, or Member

**Request Body** (all fields optional):
```json
{
  "clientName": "Updated Name",
  "clientEmail": "new@example.com",
  "clientPhone": "+1-555-9999",
  "notes": "Updated notes",
  "timezone": "Europe/London"
}
```

**Response (200):** Updated appointment object.

### Cancel Appointment

```
POST /api/organizations/:organizationId/appointments/:id/cancel
```

**Auth:** Owner or Admin

**Response (200):** Cancelled appointment object.

**Side Effects:**
- A `booking_cancellation` notification is enqueued

### Reschedule Appointment

```
POST /api/organizations/:organizationId/appointments/:id/reschedule
```

**Auth:** Owner, Admin, or Member

**Request Body:**
```json
{
  "startTime": "2026-04-02T15:00:00.000Z",
  "endTime": "2026-04-02T15:30:00.000Z",
  "timezone": "America/New_York"
}
```

**Response (200):** Rescheduled appointment object.

**Side Effects:**
- A `booking_rescheduled` notification is enqueued

**Errors:**
- `409` — New time slot is not available

---

## Availability

### List Availability

```
GET /api/organizations/:organizationId/availability
```

**Auth:** Requires session cookie.

**Response (200):** Array of availability window objects.

### Create Availability

```
POST /api/organizations/:organizationId/availability
```

**Auth:** Owner, Admin, or Member

**Request Body:**
```json
{
  "type": "weekly",
  "startTime": "2026-04-01T09:00:00.000Z",
  "endTime": "2026-06-30T17:00:00.000Z",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "bufferMinutes": 15,
  "timezone": "America/New_York"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `type` | string | Yes | `hourly`, `daily`, `weekly`, or `monthly` |
| `startTime` | ISO 8601 | Yes | Range start (UTC) |
| `endTime` | ISO 8601 | Yes | Range end (UTC) |
| `daysOfWeek` | number[] | Weekly only | 0=Sun, 1=Mon, ..., 6=Sat |
| `bufferMinutes` | number | No | Buffer between slots (0–480) |
| `timezone` | string | Yes | IANA timezone |

**Response (201):** Created availability object.

See [AVAILABILITY_SETTINGS.md](AVAILABILITY_SETTINGS.md) for detailed behavior by type.

### Delete Availability

```
DELETE /api/organizations/:organizationId/availability/:id
```

**Auth:** Owner, Admin, or Member

**Response (204)**

---

## Time Blocks

Time blocks represent unavailability periods (holidays, breaks, etc.) that override availability windows.

### List Time Blocks

```
GET /api/organizations/:organizationId/time-blocks
```

**Auth:** Requires session cookie.

**Response (200):** Array of time block objects.

### Create Time Block

```
POST /api/organizations/:organizationId/time-blocks
```

**Auth:** Owner, Admin, or Member

**Request Body:**
```json
{
  "title": "Lunch Break",
  "startTime": "2026-04-01T12:00:00.000Z",
  "endTime": "2026-04-01T13:00:00.000Z",
  "recurrence": "daily",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "timezone": "America/New_York"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | No | Display label |
| `startTime` | ISO 8601 | Yes | Block start (UTC) |
| `endTime` | ISO 8601 | Yes | Block end (UTC) |
| `recurrence` | string | No | `none`, `daily`, or `weekly` |
| `daysOfWeek` | number[] | No | For weekly recurrence |
| `timezone` | string | Yes | IANA timezone |

**Response (201):** Created time block object.

### Delete Time Block

```
DELETE /api/organizations/:organizationId/time-blocks/:id
```

**Auth:** Owner, Admin, or Member

**Response (204)**

---

## Booking Links

Opaque short-token URLs for sharing booking pages.

### Create Booking Link

```
POST /api/organizations/:organizationId/booking-links
```

**Auth:** Owner or Admin

**Request Body:**
```json
{
  "userId": "user-uuid",
  "label": "Website booking"
}
```

**Response (201):**
```json
{
  "id": "link-uuid",
  "organizationId": "org-uuid",
  "userId": "user-uuid",
  "token": "abc123",
  "label": "Website booking",
  "active": true,
  "createdAt": "2026-03-31T10:00:00.000Z"
}
```

### List Booking Links

```
GET /api/organizations/:organizationId/booking-links
```

**Auth:** Owner, Admin, or Member

**Response (200):** Array of booking link objects.

### Delete Booking Link

```
DELETE /api/organizations/:organizationId/booking-links/:linkId
```

**Auth:** Owner or Admin

**Response (204)** — Deactivates the link.

---

## Email Templates

Customize notification emails per organization. Four template types supported: `booking_confirmation`, `booking_reminder`, `booking_cancellation`, `booking_rescheduled`.

Templates use `{{variable}}` placeholders:

| Variable | Description |
|----------|-------------|
| `{{clientName}}` | Client's display name |
| `{{clientEmail}}` | Client's email address |
| `{{appointmentDate}}` | Full date in appointment timezone |
| `{{appointmentTime}}` | Time in appointment timezone |
| `{{appointmentTimezone}}` | IANA timezone identifier |
| `{{appointmentDuration}}` | Duration in minutes |
| `{{confirmationRef}}` | Public confirmation code |
| `{{organizationName}}` | Organization display name |
| `{{userName}}` | Team member's name |

### List Templates

```
GET /api/organizations/:organizationId/email-templates
```

**Auth:** Owner or Admin

**Response (200):** Array of template objects (custom overrides + defaults for uncustomized types).

### Get Template

```
GET /api/organizations/:organizationId/email-templates/:type
```

**Auth:** Owner or Admin

**Response (200):** Template object with `subject`, `htmlBody`, `textBody`, and `isDefault` flag.

### Create/Update Template

```
PUT /api/organizations/:organizationId/email-templates/:type
```

**Auth:** Owner or Admin

**Request Body:**
```json
{
  "subject": "Your appointment with {{organizationName}}",
  "htmlBody": "<h1>Confirmed!</h1><p>Hi {{clientName}}, your appointment is on {{appointmentDate}} at {{appointmentTime}}.</p>",
  "textBody": "Hi {{clientName}}, confirmed for {{appointmentDate}} at {{appointmentTime}}."
}
```

**Response (200):** Updated template object.

### Delete Template

```
DELETE /api/organizations/:organizationId/email-templates/:type
```

**Auth:** Owner or Admin

Reverts to the built-in default template for that type.

**Response (204)**

### Preview Template

```
POST /api/organizations/:organizationId/email-templates/:type/preview
```

**Auth:** Owner or Admin

Renders the template with sample data for preview.

**Request Body** (optional — uses stored template if omitted):
```json
{
  "subject": "Preview: {{clientName}}",
  "htmlBody": "<p>Hi {{clientName}}</p>"
}
```

**Response (200):**
```json
{
  "subject": "Preview: Jane Smith",
  "html": "<p>Hi Jane Smith</p>"
}
```

---

## User Profile

### Get My Profile

```
GET /api/users/me
```

**Auth:** Requires session cookie.

**Response (200):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://...",
  "timezone": "America/New_York",
  "createdAt": "2026-03-28T00:00:00.000Z",
  "updatedAt": "2026-03-28T00:00:00.000Z"
}
```

### Update My Profile

```
PATCH /api/users/me
```

**Auth:** Requires session cookie.

**Request Body** (all fields optional):
```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "timezone": "Europe/London",
  "profileImageUrl": "https://example.com/avatar.jpg"
}
```

Timezone is validated against the IANA timezone database.

**Response (200):** Updated user object.

**Errors:**
- `400` — Invalid timezone or no valid fields
