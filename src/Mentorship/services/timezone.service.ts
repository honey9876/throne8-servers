import { logger } from "@/shared/logger.util";
import { BadRequestError } from "@/shared/errors/app.error";
import TimezoneUtils from "@/Mentorship/utils/timezone";

interface TimezoneConversionRequest {
  dateTime: Date | string;
  fromTimezone: string;
  toTimezone: string;
}

interface TimeStringConversionRequest {
  time: string;
  date: Date;
  fromTimezone: string;
  toTimezone: string;
}

interface TimezoneInfo {
  timezone: string;
  offset: number;
  abbreviation: string;
  isDST: boolean;
  currentTime: string;
}

class TimezoneService {
  async getAllTimezones(): Promise<Array<{ value: string; label: string; offset: number }>> {
    try {
      const timezones = TimezoneUtils.getAllTimezones();

      const timezonesWithMetadata = timezones.map((tz) => ({
        value: tz,
        label: this.formatTimezoneLabel(tz),
        offset: TimezoneUtils.getTimezoneOffset(tz),
      }));

      timezonesWithMetadata.sort((a, b) => a.offset - b.offset);

      return timezonesWithMetadata;
    } catch(error : any) {
      logger.error('Failed to get timezones:', error);
      throw new Error('Failed to retrieve timezones');
    }
  }

  async getTimezoneInfo(timezone: string): Promise<TimezoneInfo> {
    try {
      if (!TimezoneUtils.isValidTimezone(timezone)) {
        throw new BadRequestError('Invalid timezone');
      }

      const currentTime = TimezoneUtils.getCurrentTimeInTimezone(timezone);

      return {
        timezone,
        offset: TimezoneUtils.getTimezoneOffset(timezone),
        abbreviation: TimezoneUtils.getTimezoneAbbreviation(timezone),
        isDST: TimezoneUtils.isDST(timezone),
        currentTime: currentTime.toISO()!,
      };
    } catch(error : any) {
      logger.error('Failed to get timezone info:', error);
      throw error;
    }
  }

  async convertTimezone(
    request: TimezoneConversionRequest
  ): Promise<{ original: string; converted: string }> {
    try {
      if (!TimezoneUtils.isValidTimezone(request.fromTimezone)) {
        throw new BadRequestError('Invalid source timezone');
      }

      if (!TimezoneUtils.isValidTimezone(request.toTimezone)) {
        throw new BadRequestError('Invalid target timezone');
      }

      const converted = TimezoneUtils.convertTimezone(
        request.dateTime,
        request.fromTimezone,
        request.toTimezone
      );

      return {
        original: TimezoneUtils.formatInTimezone(
          request.dateTime,
          request.fromTimezone,
          'yyyy-MM-dd HH:mm:ss'
        ),
        converted: converted.toFormat('yyyy-MM-dd HH:mm:ss'),
      };
    } catch(error : any) {
      logger.error('Timezone conversion failed:', error);
      throw error;
    }
  }

  async convertTimeString(
    request: TimeStringConversionRequest
  ): Promise<{ original: string; converted: string; date: string }> {
    try {
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(request.time)) {
        throw new BadRequestError('Invalid time format. Use HH:mm');
      }

      if (!TimezoneUtils.isValidTimezone(request.fromTimezone)) {
        throw new BadRequestError('Invalid source timezone');
      }

      if (!TimezoneUtils.isValidTimezone(request.toTimezone)) {
        throw new BadRequestError('Invalid target timezone');
      }

      const convertedTime = TimezoneUtils.convertTimeString(
        request.time,
        request.date,
        request.fromTimezone,
        request.toTimezone
      );

      return {
        original: request.time,
        converted: convertedTime,
        date: request.date.toISOString().split('T')[0],
      };
    } catch(error : any) {
      logger.error('Time string conversion failed:', error);
      throw error;
    }
  }

  async getTimeDifference(
    timezone1: string,
    timezone2: string
  ): Promise<{ difference: number; description: string }> {
    try {
      if (!TimezoneUtils.isValidTimezone(timezone1)) {
        throw new BadRequestError('Invalid timezone 1');
      }

      if (!TimezoneUtils.isValidTimezone(timezone2)) {
        throw new BadRequestError('Invalid timezone 2');
      }

      const difference = TimezoneUtils.getTimeDifference(timezone1, timezone2);

      let description: string;
      if (difference === 0) {
        description = 'Same timezone';
      } else if (difference > 0) {
        description = `${timezone1} is ${difference} hours ahead of ${timezone2}`;
      } else {
        description = `${timezone1} is ${Math.abs(difference)} hours behind ${timezone2}`;
      }

      return { difference, description };
    } catch(error : any) {
      logger.error('Failed to calculate time difference:', error);
      throw error;
    }
  }

  async validateTimezone(timezone: string): Promise<{ valid: boolean; message: string }> {
    try {
      const valid = TimezoneUtils.isValidTimezone(timezone);

      return {
        valid,
        message: valid ? 'Valid timezone' : 'Invalid timezone',
      };
    } catch(error : any) {
      logger.error('Timezone validation failed:', error);
      return {
        valid: false,
        message: 'Timezone validation failed',
      };
    }
  }

  async getPopularTimezones(): Promise<Array<{ value: string; label: string; offset: number }>> {
    const popularTimezones = [
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'America/Chicago',
      'Europe/London',
      'Europe/Paris',
      'Asia/Kolkata',
      'Asia/Dubai',
      'Asia/Singapore',
      'Asia/Tokyo',
      'Australia/Sydney',
    ];

    return popularTimezones.map((tz) => ({
      value: tz,
      label: this.formatTimezoneLabel(tz),
      offset: TimezoneUtils.getTimezoneOffset(tz),
    }));
  }

  private formatTimezoneLabel(timezone: string): string {
    const offset = TimezoneUtils.getTimezoneOffset(timezone);
    const sign = offset >= 0 ? '+' : '';
    const offsetStr = `GMT${sign}${offset}`;

    const parts = timezone.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ');

    return `${city} (${offsetStr})`;
  }
}

export default new TimezoneService();