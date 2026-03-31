import { describe, expect, it } from 'vitest';
import { generateIcsContent, generateIcsAttachment } from '../utils/icsGenerator.js';

describe('IcsGenerator', () => {
  const baseParams = {
    uid: '550e8400-e29b-41d4-a716-446655440000',
    summary: 'Appointment with Jane Doe',
    startTime: '2026-04-06T18:00:00.000Z',
    endTime: '2026-04-06T19:00:00.000Z',
  };

  describe('generateIcsContent', () => {
    it('produces valid VCALENDAR structure with BEGIN/END markers', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('END:VEVENT');
    });

    it('sets VERSION:2.0 and PRODID', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//TimePilot//Calendar Booking//EN');
    });

    it('formats DTSTART and DTEND in UTC (trailing Z)', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain('DTSTART:20260406T180000Z');
      expect(ics).toContain('DTEND:20260406T190000Z');
    });

    it('includes UID with @timepilot.app domain', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain(`UID:${baseParams.uid}@timepilot.app`);
    });

    it('includes SUMMARY', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain('SUMMARY:Appointment with Jane Doe');
    });

    it('includes DTSTAMP in UTC format', () => {
      const ics = generateIcsContent(baseParams);
      // DTSTAMP should match the format YYYYMMDDTHHMMSSZ
      const dtstampMatch = ics.match(/DTSTAMP:(\d{8}T\d{6}Z)/);
      expect(dtstampMatch).toBeTruthy();
    });

    it('includes DESCRIPTION when provided', () => {
      const ics = generateIcsContent({
        ...baseParams,
        description: 'Booking with Jane for consultation',
      });
      expect(ics).toContain('DESCRIPTION:Booking with Jane for consultation');
    });

    it('omits DESCRIPTION when not provided', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).not.toContain('DESCRIPTION:');
    });

    it('includes ORGANIZER with CN when provided', () => {
      const ics = generateIcsContent({
        ...baseParams,
        organizerName: 'John Smith',
        organizerEmail: 'john@example.com',
      });
      expect(ics).toContain('ORGANIZER;CN=John Smith:mailto:john@example.com');
    });

    it('includes ATTENDEE with CN when provided', () => {
      const ics = generateIcsContent({
        ...baseParams,
        attendeeName: 'Jane Doe',
        attendeeEmail: 'jane@example.com',
      });
      expect(ics).toContain('ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED;CN=Jane Doe:mailto:jane@example.com');
    });

    it('includes STATUS when provided', () => {
      const ics = generateIcsContent({
        ...baseParams,
        status: 'CONFIRMED',
      });
      expect(ics).toContain('STATUS:CONFIRMED');
    });

    it('escapes special characters in text fields', () => {
      const ics = generateIcsContent({
        ...baseParams,
        summary: 'Meeting; with, special\\chars\nnewline',
      });
      expect(ics).toContain('SUMMARY:Meeting\\; with\\, special\\\\chars\\nnewline');
    });

    it('uses CRLF line endings per RFC 5545', () => {
      const ics = generateIcsContent(baseParams);
      // Every line should end with \r\n
      const lines = ics.split('\r\n');
      expect(lines.length).toBeGreaterThan(5);
      // Last entry after split should be empty (trailing CRLF)
      expect(lines[lines.length - 1]).toBe('');
    });

    it('includes METHOD:REQUEST', () => {
      const ics = generateIcsContent(baseParams);
      expect(ics).toContain('METHOD:REQUEST');
    });
  });

  describe('generateIcsAttachment', () => {
    it('returns object with filename, contentType, and base64 content', () => {
      const attachment = generateIcsAttachment(baseParams);
      expect(attachment.filename).toBe('appointment.ics');
      expect(attachment.contentType).toBe('text/calendar; method=REQUEST');
      expect(typeof attachment.content).toBe('string');
      // Verify it's valid base64
      const decoded = Buffer.from(attachment.content, 'base64').toString('utf-8');
      expect(decoded).toContain('BEGIN:VCALENDAR');
    });

    it('base64 content decodes to valid ICS', () => {
      const attachment = generateIcsAttachment({
        ...baseParams,
        attendeeName: 'Jane Doe',
        attendeeEmail: 'jane@example.com',
      });
      const decoded = Buffer.from(attachment.content, 'base64').toString('utf-8');
      expect(decoded).toContain('DTSTART:20260406T180000Z');
      expect(decoded).toContain('ATTENDEE');
    });
  });
});
