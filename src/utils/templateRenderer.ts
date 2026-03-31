/**
 * Template Rendering Engine
 *
 * Provides mustache-style {{variable}} rendering for email templates.
 * Sanitizes variable values for XSS prevention in HTML contexts.
 * Supplies default templates for all notification types as fallbacks.
 */

import { NotificationType } from '../types/index.js';

/** All available template variables and their descriptions. */
export const TEMPLATE_VARIABLES = [
  { key: 'clientName', description: 'Name of the client who booked' },
  { key: 'clientEmail', description: 'Email of the client' },
  { key: 'appointmentDate', description: 'Appointment date (formatted)' },
  { key: 'appointmentTime', description: 'Appointment time (formatted)' },
  { key: 'appointmentTimezone', description: 'Timezone of the appointment' },
  { key: 'appointmentDuration', description: 'Duration in minutes' },
  { key: 'confirmationRef', description: 'Booking confirmation reference' },
  { key: 'organizationName', description: 'Organization name' },
  { key: 'userName', description: 'Name of the user/provider' },
] as const;

export type TemplateVariables = Record<string, string>;

/**
 * Escapes HTML special characters to prevent XSS when injecting
 * user-supplied values into HTML templates.
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Replaces all {{variableName}} tokens in the template with sanitized values.
 * Unknown variables are left as-is (not removed) so authors can spot typos.
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
    const value = variables[varName];
    if (value === undefined) return `{{${varName}}}`;
    return escapeHtml(value);
  });
}

export interface DefaultTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

const DEFAULT_TEMPLATES: Record<string, DefaultTemplate> = {
  [NotificationType.BOOKING_CONFIRMATION]: {
    subject: 'Booking confirmed — {{confirmationRef}}',
    htmlBody: `<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0f766e">Your booking is confirmed ✓</h2>
  <p>Hi {{clientName}},</p>
  <p>Your appointment has been confirmed for <strong>{{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}})</strong>.</p>
  <p>Confirmation reference: <strong>{{confirmationRef}}</strong></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:0.85rem">{{organizationName}} — powered by TimePilot</p>
</body></html>`,
    textBody: `Hi {{clientName}},\n\nYour appointment has been confirmed for {{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}}).\nConfirmation reference: {{confirmationRef}}\n\n{{organizationName}} — powered by TimePilot`,
  },

  [NotificationType.BOOKING_CANCELLATION]: {
    subject: 'Booking cancelled — {{confirmationRef}}',
    htmlBody: `<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#dc2626">Your booking has been cancelled</h2>
  <p>Hi {{clientName}},</p>
  <p>Your appointment scheduled for <strong>{{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}})</strong> has been cancelled.</p>
  <p>Reference: <strong>{{confirmationRef}}</strong></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:0.85rem">{{organizationName}} — powered by TimePilot</p>
</body></html>`,
    textBody: `Hi {{clientName}},\n\nYour appointment scheduled for {{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}}) has been cancelled.\nReference: {{confirmationRef}}\n\n{{organizationName}} — powered by TimePilot`,
  },

  [NotificationType.BOOKING_REMINDER]: {
    subject: 'Reminder: upcoming appointment — {{confirmationRef}}',
    htmlBody: `<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0f766e">Reminder: your appointment is coming up</h2>
  <p>Hi {{clientName}},</p>
  <p>This is a reminder for your appointment on <strong>{{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}})</strong>.</p>
  <p>Reference: <strong>{{confirmationRef}}</strong></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:0.85rem">{{organizationName}} — powered by TimePilot</p>
</body></html>`,
    textBody: `Hi {{clientName}},\n\nReminder: your appointment is on {{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}}).\nReference: {{confirmationRef}}\n\n{{organizationName}} — powered by TimePilot`,
  },

  booking_rescheduled: {
    subject: 'Booking rescheduled — {{confirmationRef}}',
    htmlBody: `<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#d97706">Your booking has been rescheduled</h2>
  <p>Hi {{clientName}},</p>
  <p>Your appointment has been moved to <strong>{{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}})</strong>.</p>
  <p>Confirmation reference: <strong>{{confirmationRef}}</strong></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:0.85rem">{{organizationName}} — powered by TimePilot</p>
</body></html>`,
    textBody: `Hi {{clientName}},\n\nYour appointment has been moved to {{appointmentDate}} at {{appointmentTime}} ({{appointmentTimezone}}).\nConfirmation reference: {{confirmationRef}}\n\n{{organizationName}} — powered by TimePilot`,
  },
};

/**
 * Returns the hardcoded default template for a given notification type.
 * Falls back to a generic template if type is unknown.
 */
export function getDefaultTemplate(type: string): DefaultTemplate {
  return DEFAULT_TEMPLATES[type] ?? {
    subject: 'Notification — {{confirmationRef}}',
    htmlBody: `<!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0f766e">Notification</h2>
  <p>Hi {{clientName}},</p>
  <p>This is a notification regarding your appointment on <strong>{{appointmentDate}} at {{appointmentTime}}</strong>.</p>
  <p>Reference: <strong>{{confirmationRef}}</strong></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
  <p style="color:#6b7280;font-size:0.85rem">{{organizationName}} — powered by TimePilot</p>
</body></html>`,
    textBody: `Hi {{clientName}},\n\nNotification regarding your appointment on {{appointmentDate}} at {{appointmentTime}}.\nReference: {{confirmationRef}}\n\n{{organizationName}} — powered by TimePilot`,
  };
}
