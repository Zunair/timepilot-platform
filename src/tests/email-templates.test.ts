import { describe, expect, it } from 'vitest';
import { renderTemplate, getDefaultTemplate, TEMPLATE_VARIABLES } from '../utils/templateRenderer.js';

describe('templateRenderer', () => {
  describe('renderTemplate', () => {
    it('replaces known variables with sanitized values', () => {
      const result = renderTemplate('Hi {{clientName}}, ref: {{confirmationRef}}', {
        clientName: 'Jane Doe',
        confirmationRef: 'TP-A1B2C3',
      });
      expect(result).toBe('Hi Jane Doe, ref: TP-A1B2C3');
    });

    it('leaves unknown variables in output as-is', () => {
      const result = renderTemplate('Hello {{unknownVar}}!', {});
      expect(result).toBe('Hello {{unknownVar}}!');
    });

    it('escapes HTML in variable values to prevent XSS', () => {
      const result = renderTemplate('Name: {{clientName}}', {
        clientName: '<script>alert("xss")</script>',
      });
      expect(result).toBe('Name: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    it('escapes ampersands in variable values', () => {
      const result = renderTemplate('Company: {{organizationName}}', {
        organizationName: 'Foo & Bar',
      });
      expect(result).toBe('Company: Foo &amp; Bar');
    });

    it('handles single quotes in values', () => {
      const result = renderTemplate('Name: {{clientName}}', {
        clientName: "O'Brien",
      });
      expect(result).toBe("Name: O&#039;Brien");
    });

    it('handles template with no variables', () => {
      const result = renderTemplate('No variables here', { clientName: 'Jane' });
      expect(result).toBe('No variables here');
    });

    it('handles empty string variable values', () => {
      const result = renderTemplate('Name: {{clientName}}', { clientName: '' });
      expect(result).toBe('Name: ');
    });

    it('replaces multiple occurrences of the same variable', () => {
      const result = renderTemplate('{{clientName}} booked. Notify {{clientName}}.', {
        clientName: 'Jane',
      });
      expect(result).toBe('Jane booked. Notify Jane.');
    });
  });

  describe('getDefaultTemplate', () => {
    it('returns a template for booking_confirmation', () => {
      const template = getDefaultTemplate('booking_confirmation');
      expect(template.subject).toContain('{{confirmationRef}}');
      expect(template.htmlBody).toContain('{{clientName}}');
      expect(template.textBody).toContain('{{clientName}}');
    });

    it('returns a template for booking_cancellation', () => {
      const template = getDefaultTemplate('booking_cancellation');
      expect(template.subject).toContain('cancelled');
      expect(template.htmlBody).toContain('cancelled');
    });

    it('returns a template for booking_reminder', () => {
      const template = getDefaultTemplate('booking_reminder');
      expect(template.subject).toContain('Reminder');
    });

    it('returns a template for booking_rescheduled', () => {
      const template = getDefaultTemplate('booking_rescheduled');
      expect(template.subject).toContain('rescheduled');
      expect(template.htmlBody).toContain('rescheduled');
    });

    it('returns a generic fallback for unknown types', () => {
      const template = getDefaultTemplate('unknown_type');
      expect(template.subject).toContain('Notification');
      expect(template.htmlBody).toContain('{{clientName}}');
    });
  });

  describe('TEMPLATE_VARIABLES', () => {
    it('has expected variable keys', () => {
      const keys = TEMPLATE_VARIABLES.map((v) => v.key);
      expect(keys).toContain('clientName');
      expect(keys).toContain('clientEmail');
      expect(keys).toContain('appointmentDate');
      expect(keys).toContain('appointmentTime');
      expect(keys).toContain('confirmationRef');
      expect(keys).toContain('organizationName');
      expect(keys).toContain('userName');
    });

    it('each variable has a description', () => {
      for (const variable of TEMPLATE_VARIABLES) {
        expect(variable.description.length).toBeGreaterThan(0);
      }
    });
  });
});
