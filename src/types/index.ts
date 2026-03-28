/**
 * TimePilot Core Types
 * 
 * This module defines all core types and interfaces used throughout the platform.
 * Types are organized by domain: authentication, organizations, scheduling, and notifications.
 * 
 * Key design principles:
 * - All timestamps persist in UTC (ISO 8601 format)
 * - Timezone context is tracked separately for user intent auditing
 * - Tenant/organization scoping is explicit in all resource types
 * - Role-based access control is enforced at the service layer
 */

export type UUID = string & { readonly __brand: 'UUID' };

// ============================================================================
// AUTHENTICATION & SESSIONS
// ============================================================================

export enum RoleType {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export interface User {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
  timezone: string;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

export interface Session {
  id: UUID;
  userId: UUID;
  organizationId: UUID;
  expiresAt: string; // ISO 8601 UTC
  createdAt: string; // ISO 8601 UTC
}

export interface OAuthProvider {
  provider: 'google' | 'apple' | 'microsoft';
  providerUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
}

export interface OAuthTokenLifecycle {
  provider: 'google' | 'apple' | 'microsoft';
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  accessTokenExpiresAt?: string; // ISO 8601 UTC
}

// ============================================================================
// ORGANIZATIONS & TENANTS
// ============================================================================

/**
 * Organization represents a tenant in the system.
 * Every resource is scoped to an organization for strict multi-tenant isolation.
 */
export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  logoUploadedAt?: string;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

/**
 * OrganizationMember represents a user's role and permissions within an organization.
 * Authorization checks enforce role-based access control on all protected operations.
 */
export interface OrganizationMember {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  role: RoleType;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

// ============================================================================
// SCHEDULING & AVAILABILITY
// ============================================================================

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export enum AvailabilityType {
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/**
 * Availability represents when a user is available for appointments.
 * Supports multiple granularities: hour, day, week, month.
 * All times stored in UTC with timezone context for user intent auditing.
 */
export interface Availability {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  type: AvailabilityType;
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  daysOfWeek?: DayOfWeek[]; // For week-based availability
  bufferMinutes: number;
  timezone: string; // Timezone context for user intent (e.g., 'America/New_York')
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

/**
 * Appointment represents a booked slot between a user and a client.
 * Status tracks the lifecycle: scheduled, completed, cancelled.
 */
export interface Appointment {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  startTime: string; // ISO 8601 UTC
  endTime: string; // ISO 8601 UTC
  timezone: string; // Timezone context for appointment intent
  notes?: string;
  confirmationRef: string; // Unique public reference / booking confirmation number
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  cancelledAt?: string; // ISO 8601 UTC
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export enum NotificationType {
  BOOKING_CONFIRMATION = 'booking_confirmation',
  BOOKING_REMINDER = 'booking_reminder',
  BOOKING_CANCELLATION = 'booking_cancellation',
}

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  DELIVERED = 'delivered',
  BOUNCED = 'bounced',
}

/**
 * Notification represents a sendable notification event.
 * Uses async queue/worker pattern for reliability.
 * Includes idempotency key for preventing duplicate sends.
 * Records delivery status for observability and support.
 */
export interface Notification {
  id: UUID;
  organizationId: UUID;
  appointmentId: UUID;
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string; // Email or phone number
  status: NotificationStatus;
  idempotencyKey: string; // UUID for deduplication
  attempts: number;
  nextRetryAt?: string; // ISO 8601 UTC
  sentAt?: string; // ISO 8601 UTC
  failureReason?: string;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface TenantContext {
  organizationId: UUID;
  userId: UUID;
  role: RoleType;
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string; // ISO 8601 UTC
}

export interface ClientError {
  message: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}
