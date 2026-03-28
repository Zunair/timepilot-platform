/**
 * Role-Based Permission Matrix
 *
 * Defines what actions each role can perform in the system.
 * Used to gate features and validate requests at the service layer.
 */

import { RoleType } from '../types/index.js';

export enum Permission {
  // Organization management
  VIEW_ORGANIZATION = 'view_organization',
  EDIT_ORGANIZATION = 'edit_organization',
  DELETE_ORGANIZATION = 'delete_organization',

  // Member management
  VIEW_MEMBERS = 'view_members',
  INVITE_MEMBERS = 'invite_members',
  REMOVE_MEMBERS = 'remove_members',
  CHANGE_MEMBER_ROLE = 'change_member_role',

  // Availability/Schedule
  VIEW_AVAILABILITY = 'view_availability',
  EDIT_AVAILABILITY = 'edit_availability',
  DELETE_AVAILABILITY = 'delete_availability',

  // Appointments
  VIEW_APPOINTMENTS = 'view_appointments',
  CANCEL_APPOINTMENTS = 'cancel_appointments',

  // Settings
  VIEW_SETTINGS = 'view_settings',
  EDIT_SETTINGS = 'edit_settings',

  // Notifications
  VIEW_NOTIFICATIONS = 'view_notifications',
}

/**
 * Permission matrix: what each role can do
 */
const ROLE_PERMISSIONS: Record<RoleType, Set<Permission>> = {
  [RoleType.OWNER]: new Set([
    // Organization
    Permission.VIEW_ORGANIZATION,
    Permission.EDIT_ORGANIZATION,
    Permission.DELETE_ORGANIZATION,
    // Members
    Permission.VIEW_MEMBERS,
    Permission.INVITE_MEMBERS,
    Permission.REMOVE_MEMBERS,
    Permission.CHANGE_MEMBER_ROLE,
    // Availability
    Permission.VIEW_AVAILABILITY,
    Permission.EDIT_AVAILABILITY,
    Permission.DELETE_AVAILABILITY,
    // Appointments
    Permission.VIEW_APPOINTMENTS,
    Permission.CANCEL_APPOINTMENTS,
    // Settings
    Permission.VIEW_SETTINGS,
    Permission.EDIT_SETTINGS,
    // Notifications
    Permission.VIEW_NOTIFICATIONS,
  ]),

  [RoleType.ADMIN]: new Set([
    // Organization (view only)
    Permission.VIEW_ORGANIZATION,
    // Members
    Permission.VIEW_MEMBERS,
    Permission.INVITE_MEMBERS,
    Permission.REMOVE_MEMBERS,
    // Availability
    Permission.VIEW_AVAILABILITY,
    Permission.EDIT_AVAILABILITY,
    Permission.DELETE_AVAILABILITY,
    // Appointments
    Permission.VIEW_APPOINTMENTS,
    Permission.CANCEL_APPOINTMENTS,
    // Settings (view only)
    Permission.VIEW_SETTINGS,
    // Notifications
    Permission.VIEW_NOTIFICATIONS,
  ]),

  [RoleType.MEMBER]: new Set([
    // Organization (view only)
    Permission.VIEW_ORGANIZATION,
    // Availability (own only - enforced at service layer)
    Permission.VIEW_AVAILABILITY,
    Permission.EDIT_AVAILABILITY,
    // Appointments (own only)
    Permission.VIEW_APPOINTMENTS,
    // Settings (own only)
    Permission.VIEW_SETTINGS,
  ]),

  [RoleType.VIEWER]: new Set([
    // Organization (view only)
    Permission.VIEW_ORGANIZATION,
    // Appointments (own only)
    Permission.VIEW_APPOINTMENTS,
  ]),
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: RoleType, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: RoleType): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] || []);
}

/**
 * Check if an admin role (OWNER or ADMIN) has a permission
 */
export function isAdminWithPermission(role: RoleType, permission: Permission): boolean {
  return (role === RoleType.OWNER || role === RoleType.ADMIN) && hasPermission(role, permission);
}
