import { DateTime } from 'luxon';
import crypto from 'crypto';

interface ICSEventInput {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  location: string;
  attendees: string[];
  url?: string;
  organizer?: {
    name: string;
    email: string;
  };
  alarms?: Array<{
    action: 'DISPLAY' | 'EMAIL';
    trigger: string; // e.g. '-PT15M' for 15 minutes before
    description?: string;
  }>;
}

class ICSGenerator {
  /**
   * Generate ICS calendar event string
   */
  generateEvent(input: ICSEventInput): string {
    const uid = this.generateUID();
    const timestamp = this.formatDateTime(new Date());
    const startDateTime = this.formatDateTime(input.startTime);
    const endDateTime = this.formatDateTime(input.endTime);

    let ics = 'BEGIN:VCALENDAR\r\n';
    ics += 'VERSION:2.0\r\n';
    ics += 'PRODID:-//Mentorship Platform//Calendar//EN\r\n';
    ics += 'CALSCALE:GREGORIAN\r\n';
    ics += 'METHOD:PUBLISH\r\n';
    ics += 'X-WR-CALNAME:Mentorship Session\r\n';
    ics += `X-WR-TIMEZONE:${input.timezone}\r\n`;
    ics += this.generateTimezoneComponent(input.timezone);

    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:${uid}\r\n`;
    ics += `DTSTAMP:${timestamp}\r\n`;
    ics += `DTSTART;TZID=${input.timezone}:${startDateTime}\r\n`;
    ics += `DTEND;TZID=${input.timezone}:${endDateTime}\r\n`;
    ics += `SUMMARY:${this.escape(input.title)}\r\n`;
    ics += `DESCRIPTION:${this.escape(input.description)}\r\n`;
    ics += `LOCATION:${this.escape(input.location)}\r\n`;

    if (input.url) ics += `URL:${input.url}\r\n`;

    if (input.organizer) {
      ics += `ORGANIZER;CN=${this.escape(input.organizer.name)}:mailto:${input.organizer.email}\r\n`;
    }

    input.attendees?.forEach((email) => {
      ics += `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${email}\r\n`;
    });

    if (input.alarms && input.alarms.length > 0) {
      input.alarms.forEach((alarm) => {
        ics += 'BEGIN:VALARM\r\n';
        ics += `ACTION:${alarm.action}\r\n`;
        ics += `TRIGGER:${alarm.trigger}\r\n`;
        if (alarm.description) ics += `DESCRIPTION:${this.escape(alarm.description)}\r\n`;
        ics += 'END:VALARM\r\n';
      });
    } else {
      ics += this.defaultAlarms();
    }

    ics += 'STATUS:CONFIRMED\r\n';
    ics += 'SEQUENCE:0\r\n';
    ics += 'END:VEVENT\r\n';
    ics += 'END:VCALENDAR\r\n';

    return ics;
  }

  /**
   * Generate multiple events in one ICS file
   */
  generateMultipleEvents(events: ICSEventInput[]): string {
    let ics = 'BEGIN:VCALENDAR\r\n';
    ics += 'VERSION:2.0\r\n';
    ics += 'PRODID:-//Mentorship Platform//Calendar//EN\r\n';
    ics += 'CALSCALE:GREGORIAN\r\n';
    ics += 'METHOD:PUBLISH\r\n';

    events.forEach((event) => {
      ics += 'BEGIN:VEVENT\r\n';
      ics += `UID:${this.generateUID()}\r\n`;
      ics += `DTSTAMP:${this.formatDateTime(new Date())}\r\n`;
      ics += `DTSTART:${this.formatDateTime(event.startTime)}\r\n`;
      ics += `DTEND:${this.formatDateTime(event.endTime)}\r\n`;
      ics += `SUMMARY:${this.escape(event.title)}\r\n`;
      ics += `DESCRIPTION:${this.escape(event.description)}\r\n`;
      ics += `LOCATION:${this.escape(event.location)}\r\n`;
      event.attendees?.forEach((email) => {
        ics += `ATTENDEE;RSVP=TRUE:mailto:${email}\r\n`;
      });
      ics += 'END:VEVENT\r\n';
    });

    ics += 'END:VCALENDAR\r\n';
    return ics;
  }

  /**
   * Generate cancellation ICS (METHOD:CANCEL)
   */
  generateCancellation(input: ICSEventInput, originalUID: string): string {
    let ics = 'BEGIN:VCALENDAR\r\n';
    ics += 'VERSION:2.0\r\n';
    ics += 'PRODID:-//Mentorship Platform//Calendar//EN\r\n';
    ics += 'METHOD:CANCEL\r\n';
    ics += 'BEGIN:VEVENT\r\n';
    ics += `UID:${originalUID}\r\n`;
    ics += `DTSTAMP:${this.formatDateTime(new Date())}\r\n`;
    ics += `DTSTART:${this.formatDateTime(input.startTime)}\r\n`;
    ics += `DTEND:${this.formatDateTime(input.endTime)}\r\n`;
    ics += `SUMMARY:${this.escape(input.title)}\r\n`;
    ics += 'STATUS:CANCELLED\r\n';
    ics += 'SEQUENCE:1\r\n';
    ics += 'END:VEVENT\r\n';
    ics += 'END:VCALENDAR\r\n';
    return ics;
  }

  /**
   * Returns ICS content as a Buffer for email attachments / file writes.
   * Use this instead of Blob (Blob is browser-only, not available in Node.js).
   *
   * Usage:
   *   const buf = icsGenerator.toBuffer(icsContent);
   *   fs.writeFileSync('event.ics', buf);
   *   // or attach to nodemailer: { filename: 'event.ics', content: buf }
   */
  toBuffer(icsContent: string): Buffer {
    return Buffer.from(icsContent, 'utf-8');
  }

  // ── Private helpers ──────────────────────────────────────────────

  private formatDateTime(date: Date): string {
    return DateTime.fromJSDate(date).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  }

  private generateUID(): string {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}@mentorship.platform`;
  }

  private escape(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  private generateTimezoneComponent(timezone: string): string {
    return (
      'BEGIN:VTIMEZONE\r\n' +
      `TZID:${timezone}\r\n` +
      'BEGIN:STANDARD\r\n' +
      'DTSTART:19700101T000000\r\n' +
      'TZOFFSETFROM:+0000\r\n' +
      'TZOFFSETTO:+0000\r\n' +
      'TZNAME:UTC\r\n' +
      'END:STANDARD\r\n' +
      'END:VTIMEZONE\r\n'
    );
  }

  private defaultAlarms(): string {
    const alarms = [
      { trigger: '-PT24H', desc: 'Session reminder - 24 hours' },
      { trigger: '-PT1H',  desc: 'Session reminder - 1 hour' },
      { trigger: '-PT15M', desc: 'Session starting soon - 15 minutes' },
    ];

    return alarms
      .map(
        (a) =>
          'BEGIN:VALARM\r\n' +
          'ACTION:DISPLAY\r\n' +
          `TRIGGER:${a.trigger}\r\n` +
          `DESCRIPTION:${a.desc}\r\n` +
          'END:VALARM\r\n'
      )
      .join('');
  }
}

export default new ICSGenerator();