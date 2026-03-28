# TimePilot Admin & Settings API

## Overview

The Admin & Settings API provides endpoints for organization and user management, allowing admins to configure their workspace, manage team members, and control availability rules.

## Authentication

All admin endpoints require an authenticated session with valid tenant context. Session credentials must be included in request headers.

## Endpoints

### Organization Dashboard

#### GET /api/organizations/:organizationId/admin/dashboard

Get organization statistics and member list for the admin dashboard.

**Required Role:** Owner, Admin

**Response (200 OK):**
```json
{
  "organization": {
    "id": "uuid",
    "name": "Organization Name",
    "slug": "org-slug",
    "description": "Optional description",
    "logoUrl": "https://...",
    "primaryColor": "#0f766e",
    "secondaryColor": "#d1faf3",
    "fontFamily": "Georgia",
    "createdAt": "2026-03-28T00:00:00Z",
    "updatedAt": "2026-03-28T00:00:00Z"
  },
  "members": [
    {
      "id": "member-uuid",
      "organizationId": "org-uuid",
      "userId": "user-uuid",
      "role": "owner|admin|member|viewer",
      "createdAt": "2026-03-28T00:00:00Z",
      "updatedAt": "2026-03-28T00:00:00Z"
    }
  ],
  "stats": {
    "totalMembers": 3,
    "admins": 1,
    "createdAt": "2026-03-28T00:00:00Z"
  }
}
```

### Organization Settings

#### PATCH /api/organizations/:organizationId/admin/settings

Update organization branding and settings.

**Required Role:** Owner, Admin

**Request Body:**
```json
{
  "name": "New Organization Name",
  "description": "Organization description",
  "logoUrl": "https://example.com/logo.png",
  "primaryColor": "#0f766e",
  "secondaryColor": "#d1faf3",
  "fontFamily": "Georgia"
}
```

**Response (200 OK):**
Returns updated organization object (see dashboard response above).

**Errors:**
- `400 Bad Request` - No valid fields to update
- `404 Not Found` - Organization not found
- `403 Forbidden` - Insufficient permissions

### Team Member Management

#### GET /api/organizations/:organizationId/members

Get list of all team members in the organization.

**Required Role:** Owner, Admin

**Response (200 OK):**
```json
[
  {
    "id": "member-uuid",
    "organizationId": "org-uuid",
    "userId": "user-uuid",
    "role": "owner",
    "createdAt": "2026-03-28T00:00:00Z",
    "updatedAt": "2026-03-28T00:00:00Z"
  }
]
```

#### POST /api/organizations/:organizationId/members

Invite a user to the organization by email.

**Required Role:** Owner, Admin

**Request Body:**
```json
{
  "email": "user@example.com",
  "role": "admin|member|viewer"
}
```

**Response (201 Created):**
Returns created organization member object.

**Errors:**
- `400 Bad Request` - Missing email/role or invalid role
- `404 Not Found` - User with email not found
- `403 Forbidden` - Insufficient permissions

#### PUT /api/organizations/:organizationId/members/:memberId/role

Change a member's role in the organization.

**Required Role:** Owner (only owners can change roles)

**Request Body:**
```json
{
  "role": "admin|member|viewer"
}
```

**Response (200 OK):**
Returns updated organization member object.

**Errors:**
- `400 Bad Request` - Invalid role
- `403 Forbidden` - Only owners can change roles
- `404 Not Found` - Member not found

#### DELETE /api/organizations/:organizationId/members/:memberId

Remove a member from the organization.

**Required Role:** Owner, Admin

**Response (204 No Content)**

**Side Effects:**
- All sessions for the removed user are revoked
- User loses access to organization

**Errors:**
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Member not found

### User Profile & Settings

#### GET /api/users/me

Get the current authenticated user's profile.

**Required Role:** Authenticated (any role)

**Response (200 OK):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://...",
  "timezone": "America/New_York",
  "createdAt": "2026-03-28T00:00:00Z",
  "updatedAt": "2026-03-28T00:00:00Z"
}
```

#### PATCH /api/users/me

Update current user's profile.

**Required Role:** Authenticated (any role)

**Request Body:**
```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "timezone": "America/New_York",
  "profileImageUrl": "https://example.com/avatar.jpg"
}
```

**Timezone Validation:**
- Must be a valid IANA timezone (e.g., "America/New_York", "Europe/London", "UTC")
- Invalid timezones will return 400 Bad Request

**Response (200 OK):**
Returns updated user object.

**Errors:**
- `400 Bad Request` - Invalid timezone or no valid fields to update
- `404 Not Found` - User not found

#### GET /api/users/:userId

Get a user's public profile (safe fields only).

**Response (200 OK):**
```json
{
  "id": "user-uuid",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://..."
}
```

**Note:** Public endpoint - does not return email, timezone, or timestamps.

**Errors:**
- `404 Not Found` - User not found

## Role-Based Access Control

### Permission Matrix

| Action | Owner | Admin | Member | Viewer |
|--------|-------|-------|--------|--------|
| View Organization | ✓ | ✓ | ✓ | ✓ |
| Edit Organization | ✓ | ✗ | ✗ | ✗ |
| Delete Organization | ✓ | ✗ | ✗ | ✗ |
| View Members | ✓ | ✓ | ✗ | ✗ |
| Invite Members | ✓ | ✓ | ✗ | ✗ |
| Remove Members | ✓ | ✓ | ✗ | ✗ |
| Change Member Role | ✓ | ✗ | ✗ | ✗ |
| View Settings | ✓ | ✓ | ✓ | ✓ |
| Edit Settings | ✓ | ✓ | ✗ | ✗ |

### Role Definitions

- **Owner**: Full organization control, can delete organization and change member roles
- **Admin**: Can manage members and configure availability/settings, but not delete organization
- **Member**: Can manage only their own availability and settings
- **Viewer**: Read-only access to organization and appointments

## Error Handling

All errors follow this format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

HTTP Status Codes:
- `200 OK` - Successful GET/PATCH
- `201 Created` - Successful POST
- `204 No Content` - Successful DELETE
- `400 Bad Request` - Invalid request parameters
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Implementation Notes

### Timezone Handling

User timezone is validated against IANA timezone database using the built-in `Intl.DateTimeFormat` API. Accepted timezones include:
- `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`
- `Europe/London`, `Europe/Paris`, `Europe/Berlin`, `Europe/Amsterdam`
- `UTC`, `Etc/UTC`, `Asia/Tokyo`, `Asia/Shanghai`, and many more

### Session Context

All admin endpoints require a valid authenticated session. The session must include:
- `userId` - The authenticated user's ID
- `organizationId` - The organization being accessed
- `role` - The user's role in the organization

### Audit Trail

All organization and user configuration changes are stored with `updatedAt` timestamps for audit purposes. Future versions may include detailed change logs.

## Example Workflows

### Updating Organization Branding

```bash
PATCH /api/organizations/org-uuid/admin/settings
Content-Type: application/json

{
  "name": "Acme Studio",
  "primaryColor": "#0f766e",
  "logoUrl": "https://acme.example.com/logo.png"
}
```

### Inviting a Team Member

```bash
POST /api/organizations/org-uuid/members
Content-Type: application/json

{
  "email": "admin@acme.example.com",
  "role": "admin"
}
```

### Updating Your Profile

```bash
PATCH /api/users/me
Content-Type: application/json

{
  "firstName": "John",
  "timezone": "America/New_York"
}
```

## Rate Limiting

No rate limits are currently enforced on admin endpoints. Future versions may implement per-organization or per-user rate limits.

## Future Enhancements

- Audit log API for tracking configuration changes
- Bulk member invite via CSV
- Member invitation workflow with email verification
- Advanced permission customization
- Webhooks for organization events
- Usage analytics and reporting
