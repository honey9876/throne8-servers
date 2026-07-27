import { DateTime } from 'luxon';
import { logger } from '@/shared/logger.util';

class TimezoneUtils {
  static getAllTimezones(): string[] {
    return [
      'UTC',
      'America/New_York', 'America/Chicago', 'America/Denver',
      'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
      'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver',
      'America/Mexico_City', 'America/Sao_Paulo', 'America/Buenos_Aires',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
      'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Vienna',
      'Europe/Stockholm', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Helsinki',
      'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Athens',
      'Europe/Istanbul', 'Europe/Moscow',
      'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
      'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
      'Asia/Tokyo', 'Asia/Seoul',
      'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
      'Pacific/Auckland',
      'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
    ];
  }

  static isValidTimezone(timezone: string): boolean {
    try {
      return DateTime.local().setZone(timezone).isValid;
    } catch {
      return false;
    }
  }

  static getCurrentTimeInTimezone(timezone: string): DateTime {
    if (!this.isValidTimezone(timezone)) {
      logger.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
      timezone = 'UTC';
    }
    return DateTime.now().setZone(timezone);
  }

  static convertTimezone(
    dateTime: Date | string,
    fromTimezone: string,
    toTimezone: string
  ): DateTime {
    try {
      const dt =
        typeof dateTime === 'string'
          ? DateTime.fromISO(dateTime, { zone: fromTimezone })
          : DateTime.fromJSDate(dateTime, { zone: fromTimezone });

      if (!dt.isValid) throw new Error(`Invalid date/time: ${dateTime}`);
      return dt.setZone(toTimezone);
    } catch (error: any) {
      logger.error('Timezone conversion failed:', error);
      throw new Error('Failed to convert timezone');
    }
  }

  static convertTimeString(
    time: string,
    date: Date,
    fromTimezone: string,
    toTimezone: string
  ): string {
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`Invalid time format: ${time}`);
      }
      const converted = DateTime.fromJSDate(date, { zone: fromTimezone })
        .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 })
        .setZone(toTimezone);
      return converted.toFormat('HH:mm');
    } catch (error: any) {
      logger.error('Time string conversion failed:', error);
      throw new Error('Failed to convert time string');
    }
  }

  static getTimezoneOffset(timezone: string): number {
    try {
      return DateTime.now().setZone(timezone).offset / 60;
    } catch (error: any) {
      logger.error(`Failed to get timezone offset for ${timezone}:`, error);
      return 0;
    }
  }

  static getTimezoneAbbreviation(timezone: string): string {
    try {
      return DateTime.now().setZone(timezone).offsetNameShort || timezone;
    } catch (error: any) {
      logger.error(`Failed to get timezone abbreviation for ${timezone}:`, error);
      return timezone;
    }
  }

  static formatInTimezone(
    dateTime: Date | string,
    timezone: string,
    format: string = 'yyyy-MM-dd HH:mm:ss'
  ): string {
    try {
      const dt =
        typeof dateTime === 'string'
          ? DateTime.fromISO(dateTime)
          : DateTime.fromJSDate(dateTime);
      return dt.setZone(timezone).toFormat(format);
    } catch (error: any) {
      logger.error('Date formatting failed:', error);
      throw new Error('Failed to format date');
    }
  }

  static isDST(timezone: string, date?: Date): boolean {
    try {
      const dt = date
        ? DateTime.fromJSDate(date, { zone: timezone })
        : DateTime.now().setZone(timezone);
      return dt.isInDST;
    } catch (error: any) {
      logger.error(`Failed to check DST for ${timezone}:`, error);
      return false;
    }
  }

  static getTimeDifference(timezone1: string, timezone2: string): number {
    try {
      return this.getTimezoneOffset(timezone1) - this.getTimezoneOffset(timezone2);
    } catch (error: any) {
      logger.error('Failed to calculate time difference:', error);
      return 0;
    }
  }

  static createDateTime(date: Date, time: string, timezone: string): DateTime {
    try {
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error(`Invalid time format: ${time}`);
      }
      return DateTime.fromJSDate(date, { zone: timezone }).set({
        hour: hours,
        minute: minutes,
        second: 0,
        millisecond: 0,
      });
    } catch (error: any) {
      logger.error('Failed to create DateTime:', error);
      throw new Error('Failed to create DateTime');
    }
  }

  static getStartOfDay(date: Date, timezone: string): DateTime {
    try {
      return DateTime.fromJSDate(date, { zone: timezone }).startOf('day');
    } catch (error: any) {
      logger.error('Failed to get start of day:', error);
      throw new Error('Failed to get start of day');
    }
  }

  static getEndOfDay(date: Date, timezone: string): DateTime {
    try {
      return DateTime.fromJSDate(date, { zone: timezone }).endOf('day');
    } catch (error: any) {
      logger.error('Failed to get end of day:', error);
      throw new Error('Failed to get end of day');
    }
  }

  static isInPast(date: Date, time: string, timezone: string): boolean {
    try {
      return this.createDateTime(date, time, timezone) < DateTime.now().setZone(timezone);
    } catch {
      return false;
    }
  }

  static isInFuture(date: Date, time: string, timezone: string): boolean {
    try {
      return this.createDateTime(date, time, timezone) > DateTime.now().setZone(timezone);
    } catch {
      return false;
    }
  }

  static addDuration(
    dateTime: DateTime,
    duration: { hours?: number; minutes?: number }
  ): DateTime {
    return dateTime.plus({ hours: duration.hours ?? 0, minutes: duration.minutes ?? 0 });
  }

  static subtractDuration(
    dateTime: DateTime,
    duration: { hours?: number; minutes?: number }
  ): DateTime {
    return dateTime.minus({ hours: duration.hours ?? 0, minutes: duration.minutes ?? 0 });
  }

  static getDurationInMinutes(startTime: string, endTime: string): number {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      return eh * 60 + em - (sh * 60 + sm);
    } catch (error: any) {
      logger.error('Failed to calculate duration:', error);
      return 0;
    }
  }

  static doTimesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    try {
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      return toMin(start1) < toMin(end2) && toMin(start2) < toMin(end1);
    } catch (error: any) {
      logger.error('Failed to check time overlap:', error);
      return false;
    }
  }

  static formatTimeWithTimezone(date: Date, time: string, timezone: string): string {
    try {
      const dt = this.createDateTime(date, time, timezone);
      const abbr = this.getTimezoneAbbreviation(timezone);
      return `${dt.toFormat('hh:mm a')} ${abbr}`;
    } catch (error: any) {
      logger.error('Failed to format time with timezone:', error);
      return `${time} ${timezone}`;
    }
  }

  static getSystemTimezone(): string {
    return DateTime.local().zoneName || 'UTC';
  }

  static utcToLocal(utcDateTime: Date | string, localTimezone: string): DateTime {
    return this.convertTimezone(utcDateTime, 'UTC', localTimezone);
  }

  static localToUTC(localDateTime: Date | string, localTimezone: string): DateTime {
    return this.convertTimezone(localDateTime, localTimezone, 'UTC');
  }
}

export default TimezoneUtils;