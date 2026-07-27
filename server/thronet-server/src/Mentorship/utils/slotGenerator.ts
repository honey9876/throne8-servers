import { DateTime } from 'luxon';
import TimezoneUtils from './timezone';
import { logger } from '@/shared/logger.util';

interface SlotConfig {
  startTime: string;
  endTime: string;
  slotDuration: number;
  bufferBetween?: number;
  timezone: string;
  excludeBreaks?: Array<{ start: string; end: string }>;
}

interface GeneratedSlot {
  startTime: string;
  endTime: string;
  duration: number;
  isAvailable: boolean;
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface RecurringConfig {
  daysOfWeek: string[];
  startDate: Date;
  endDate: Date;
  slotConfig: SlotConfig;
}

class SlotGenerator {
  static generateDailySlots(date: Date, config: SlotConfig): GeneratedSlot[] {
    try {
      const { startTime, endTime, slotDuration, bufferBetween = 0, timezone, excludeBreaks = [] } = config;

      if (!this.isValidTimeFormat(startTime) || !this.isValidTimeFormat(endTime)) {
        throw new Error('Invalid time format. Use HH:mm');
      }

      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);

      let currentMinutes = startHours * 60 + startMinutes;
      const endTotalMinutes = endHours * 60 + endMinutes;

      if (currentMinutes >= endTotalMinutes) {
        logger.warn(`Invalid time range: ${startTime} to ${endTime}`);
        return [];
      }

      const slots: GeneratedSlot[] = [];

      while (currentMinutes + slotDuration <= endTotalMinutes) {
        const slotStart = this.minutesToTimeString(currentMinutes);
        const slotEnd = this.minutesToTimeString(currentMinutes + slotDuration);

        const isInBreak = this.isSlotInBreak(slotStart, slotEnd, excludeBreaks);
        const isPast = TimezoneUtils.isInPast(date, slotStart, timezone);

        if (!isInBreak && !isPast) {
          slots.push({
            startTime: slotStart,
            endTime: slotEnd,
            duration: slotDuration,
            isAvailable: true,
          });
        }

        currentMinutes += slotDuration + bufferBetween;
      }

      return slots;
    } catch (error: any) {
      logger.error('Failed to generate daily slots:', error);
      return [];
    }
  }

  static generateMultiDaySlots(dates: Date[], config: SlotConfig): Map<string, GeneratedSlot[]> {
    const slotsMap = new Map<string, GeneratedSlot[]>();

    dates.forEach((date) => {
      const slots = this.generateDailySlots(date, config);
      if (slots.length > 0) {
        slotsMap.set(this.getDateKey(date), slots);
      }
    });

    logger.info(`Generated slots for ${slotsMap.size} days`);
    return slotsMap;
  }

  static generateSlotsForDateRange(
    range: DateRange,
    config: SlotConfig
  ): Map<string, GeneratedSlot[]> {
    const dates = this.getDatesBetween(range.startDate, range.endDate);
    return this.generateMultiDaySlots(dates, config);
  }

  static generateRecurringSlots(
    recurringConfig: RecurringConfig
  ): Map<string, GeneratedSlot[]> {
    const { daysOfWeek, startDate, endDate, slotConfig } = recurringConfig;

    const filteredDates = this.getDatesBetween(startDate, endDate).filter((date) =>
      daysOfWeek.includes(this.getDayName(date))
    );

    logger.info(`Generating recurring slots for ${filteredDates.length} days`);
    return this.generateMultiDaySlots(filteredDates, slotConfig);
  }

  static mergeSlots(slots1: GeneratedSlot[], slots2: GeneratedSlot[]): GeneratedSlot[] {
    const mergedMap = new Map<string, GeneratedSlot>();

    [...slots1, ...slots2].forEach((slot) => {
      const key = `${slot.startTime}-${slot.endTime}`;
      if (!mergedMap.has(key)) mergedMap.set(key, slot);
    });

    return Array.from(mergedMap.values()).sort((a, b) =>
      a.startTime.localeCompare(b.startTime)
    );
  }

  static removeConflictingSlots(
    slots: GeneratedSlot[],
    bookedSlots: Array<{ startTime: string; endTime: string }>
  ): GeneratedSlot[] {
    return slots.filter(
      (slot) =>
        !bookedSlots.some((booked) =>
          TimezoneUtils.doTimesOverlap(slot.startTime, slot.endTime, booked.startTime, booked.endTime)
        )
    );
  }

  static filterSlotsByTimeRange(
    slots: GeneratedSlot[],
    minTime: string,
    maxTime: string
  ): GeneratedSlot[] {
    return slots.filter((slot) => slot.startTime >= minTime && slot.endTime <= maxTime);
  }

  static getNextAvailableSlot(
    slotsMap: Map<string, GeneratedSlot[]>,
    currentDate: Date,
    timezone: string
  ): { date: string; slot: GeneratedSlot } | null {
    for (const dateKey of Array.from(slotsMap.keys()).sort()) {
      const date = this.parseDateKey(dateKey);
      if (date < currentDate) continue;

      const slots = slotsMap.get(dateKey)!;
      for (const slot of slots) {
        if (slot.isAvailable && !TimezoneUtils.isInPast(date, slot.startTime, timezone)) {
          return { date: dateKey, slot };
        }
      }
    }
    return null;
  }

  static getTotalAvailableSlots(slotsMap: Map<string, GeneratedSlot[]>): number {
    let total = 0;
    slotsMap.forEach((slots) => {
      total += slots.filter((slot) => slot.isAvailable).length;
    });
    return total;
  }

  static groupSlotsByDayOfWeek(
    slotsMap: Map<string, GeneratedSlot[]>
  ): Map<string, GeneratedSlot[]> {
    const grouped = new Map<string, GeneratedSlot[]>();

    slotsMap.forEach((slots, dateKey) => {
      const dayName = this.getDayName(this.parseDateKey(dateKey));
      if (!grouped.has(dayName)) grouped.set(dayName, []);
      grouped.get(dayName)!.push(...slots);
    });

    return grouped;
  }

  static categorizeSlotsByTimeOfDay(slots: GeneratedSlot[]): {
    morning: GeneratedSlot[];
    afternoon: GeneratedSlot[];
    evening: GeneratedSlot[];
  } {
    const morning: GeneratedSlot[] = [];
    const afternoon: GeneratedSlot[] = [];
    const evening: GeneratedSlot[] = [];

    slots.forEach((slot) => {
      const hours = parseInt(slot.startTime.split(':')[0], 10);
      if (hours >= 6 && hours < 12) morning.push(slot);
      else if (hours >= 12 && hours < 18) afternoon.push(slot);
      else evening.push(slot);
    });

    return { morning, afternoon, evening };
  }

  static validateSlotConfig(config: SlotConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.isValidTimeFormat(config.startTime))
      errors.push('Invalid startTime format. Use HH:mm');
    if (!this.isValidTimeFormat(config.endTime))
      errors.push('Invalid endTime format. Use HH:mm');
    if (config.slotDuration < 15 || config.slotDuration > 240)
      errors.push('Slot duration must be between 15 and 240 minutes');
    if (config.bufferBetween !== undefined && (config.bufferBetween < 0 || config.bufferBetween > 60))
      errors.push('Buffer must be between 0 and 60 minutes');
    if (!TimezoneUtils.isValidTimezone(config.timezone))
      errors.push('Invalid timezone');

    return { valid: errors.length === 0, errors };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private static isValidTimeFormat(time: string): boolean {
    return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  }

  private static minutesToTimeString(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private static isSlotInBreak(
    slotStart: string,
    slotEnd: string,
    breaks: Array<{ start: string; end: string }>
  ): boolean {
    return breaks.some((b) =>
      TimezoneUtils.doTimesOverlap(slotStart, slotEnd, b.start, b.end)
    );
  }

  private static getDateKey(date: Date): string {
    return DateTime.fromJSDate(date).toFormat('yyyy-MM-dd');
  }

  private static parseDateKey(dateKey: string): Date {
    return DateTime.fromISO(dateKey).toJSDate();
  }

  private static getDayName(date: Date): string {
    return DateTime.fromJSDate(date).toFormat('EEEE').toLowerCase();
  }

  private static getDatesBetween(startDate: Date, endDate: Date): Date[] {
    const dates: Date[] = [];
    let current = DateTime.fromJSDate(startDate).startOf('day');
    const end = DateTime.fromJSDate(endDate).startOf('day');

    while (current <= end) {
      dates.push(current.toJSDate());
      current = current.plus({ days: 1 });
    }

    return dates;
  }
}

export default SlotGenerator;