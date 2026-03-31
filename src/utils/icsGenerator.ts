/**
 * ICS Calendar File Generator
 *
 * Generates RFC 5545 compliant VCALENDAR/VEVENT strings for email attachments.
 * Allows recipients to import appointments into Gmail, Outlook, Apple Calendar, etc.
 *
 * All times are output in UTC (DTSTART/DTEND with trailing Z).
 */

export interface IcsEventParams {
  uid: string;           // Unique identifier (use appointment ID)
  summary: string;       // Event title
  description?: string;  // Plain text description
  startTime: string;     // ISO 8601 UTC
  endTime: string;       // ISO 8601 UTC
  organizerName?: string;
  organizerEmail?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  location?: string;
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
}

export interface IcsAttachment {
  filename: string;
  content: string;       // base64-encoded .ics content
  contentType: string;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toIcsDateTimeUtc(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Generates an RFC 5545 VCALENDAR string.
 * Each line must end with CRLF (\r\n) per spec.
 */
export function generateIcsContent(params: IcsEventParams): string {
  const dtstamp = toIcsDateTimeUtc(new Date().toISOString());
  const dtstart = toIcsDateTimeUtc(params.startTime);
  const dtend = toIcsDateTimeUtc(params.endTime);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimePilot//Calendar Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}@timepilot.app`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
  ];

  if (params.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(params.description)}`);
  }

  if (params.location) {
    lines.push(`LOCATION:${escapeIcsText(params.location)}`);
  }

  if (params.organizerEmail) {
    const cn = params.organizerName ? `;CN=${escapeIcsText(params.organizerName)}` : '';
    lines.push(`ORGANIZER${cn}:mailto:${params.organizerEmail}`);
  }

  if (params.attendeeEmail) {
    const cn = params.attendeeName ? `;CN=${escapeIcsText(params.attendeeName)}` : '';
    lines.push(`ATTENDEE;RSVP=TRUE;PARTSTAT=ACCEPTED${cn}:mailto:${params.attendeeEmail}`);
  }

  if (params.status) {
    lines.push(`STATUS:${params.status}`);
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

/**
 * Generates a ready-to-attach .ics file object for email sending.
 */
export function generateIcsAttachment(params: IcsEventParams): IcsAttachment {
  const icsContent = generateIcsContent(params);
  return {
    filename: 'appointment.ics',
    content: Buffer.from(icsContent, 'utf-8').toString('base64'),
    contentType: 'text/calendar; method=REQUEST',
  };
}
