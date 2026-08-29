import { DateTime } from 'luxon';
import { Availability, Mentor } from '../models';
import SlotGenerator from '@/Mentorship/utils/slotGenerator';
import TimezoneUtils from '@/Mentorship/utils/timezone';
import { logger } from '@/shared/logger.util';
import { NotFoundError, BadRequestError, ConflictError } from '@/shared/errors/app.error';
import mentorRepository from '../repositories/mentor.repository';
import availabilityRepository from '../repositories/availability.repository';

interface CreateAvailabilityInput {
  mentorId: string;
  date: Date;
  slots: Array<{ startTime: string; endTime: string }>;
  timezone: string;
  isRecurring?: boolean;
  dayOfWeek?: string;
}

interface BulkCreateAvailabilityInput {
  mentorId: string;
  dateRange: { startDate: Date; endDate: Date };
  slotConfig: {
    startTime: string;
    endTime: string;
    slotDuration: number;
    bufferBetween?: number;
    excludeBreaks?: Array<{ start: string; end: string }>;
  };
  daysOfWeek?: string[];
  timezone: string;
}

interface AvailabilityFilters {
  startDate?: Date;
  endDate?: Date;
  status?: 'available' | 'booked' | 'blocked';
}

class AvailabilityService {
  async createAvailability(input: CreateAvailabilityInput): Promise<any> {
    try {
      logger.info(`Creating availability for mentor: ${input.mentorId}`);

      const mentor = await mentorRepository.findByMentorId(input.mentorId);
      if (!mentor) {
        throw new NotFoundError('Mentor not found');
      }

      if (!TimezoneUtils.isValidTimezone(input.timezone)) {
        throw new BadRequestError('Invalid timezone');
      }

      const existingAvailability = await availabilityRepository.findByMentorAndDate(
        input.mentorId,
        DateTime.fromJSDate(input.date).startOf('day').toJSDate(),
        DateTime.fromJSDate(input.date).endOf('day').toJSDate()
      );

      if (existingAvailability) {
        throw new ConflictError('Availability already exists for this date');
      }

      // ✅ FIX: validateSlots now checks for overlaps between slots in the same day
      this.validateSlots(input.slots);

      const dayOfWeek =
        input.dayOfWeek || DateTime.fromJSDate(input.date).toFormat('EEEE').toLowerCase();

      const availability = await availabilityRepository.create({
        mentorId: input.mentorId,
        date: input.date,
        slots: input.slots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          isBooked: false,
          isBlocked: false,
        })),
        dayOfWeek,
        isRecurring: input.isRecurring || false,
        timezone: input.timezone,
      });

      logger.info(`Availability created: ${availability.availabilityId}`);
      return availability;
    } catch (error: any) {
      logger.error(`Failed to create availability: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk create availability — uses parallel validation + batch insert
   * instead of sequential DB calls per date
   */
  async bulkCreateAvailability(
    input: BulkCreateAvailabilityInput
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    try {
      logger.info(`Bulk creating availability for mentor: ${input.mentorId}`);

      const mentor = await mentorRepository.findByMentorId(input.mentorId);
      if (!mentor) {
        throw new NotFoundError('Mentor not found');
      }

      const validation = SlotGenerator.validateSlotConfig({
        ...input.slotConfig,
        timezone: input.timezone,
      });

      if (!validation.valid) {
        throw new BadRequestError(validation.errors.join(', '));
      }

      let slotsMap: Map<string, any[]>;

      if (input.daysOfWeek && input.daysOfWeek.length > 0) {
        slotsMap = SlotGenerator.generateRecurringSlots({
          daysOfWeek: input.daysOfWeek,
          startDate: input.dateRange.startDate,
          endDate: input.dateRange.endDate,
          slotConfig: { ...input.slotConfig, timezone: input.timezone },
        });
      } else {
        slotsMap = SlotGenerator.generateSlotsForDateRange(input.dateRange, {
          ...input.slotConfig,
          timezone: input.timezone,
        });
      }

      const results = { created: 0, failed: 0, errors: [] as string[] };
      const dateEntries = Array.from(slotsMap.entries());

      // Step 1: Check all existing dates in parallel (avoid N sequential DB calls)
      const existingChecks = await Promise.allSettled(
        dateEntries.map(([dateKey]) => {
          const date = DateTime.fromISO(dateKey).toJSDate();
          return availabilityRepository.findByMentorAndDate(
            input.mentorId,
            DateTime.fromJSDate(date).startOf('day').toJSDate(),
            DateTime.fromJSDate(date).endOf('day').toJSDate()
          );
        })
      );

      // Step 2: Build valid inserts (skip dates that already exist)
      const toInsert: any[] = [];

      for (let i = 0; i < dateEntries.length; i++) {
        const [dateKey, slots] = dateEntries[i];
        const checkResult = existingChecks[i];

        if (checkResult.status === 'rejected') {
          results.failed++;
          results.errors.push(`${dateKey}: DB check failed`);
          continue;
        }

        if (checkResult.value !== null) {
          results.failed++;
          results.errors.push(`Availability already exists for ${dateKey}`);
          continue;
        }

        try {
          // ✅ FIX: Overlap check runs here too for bulk inserts
          this.validateSlots(slots);
          const date = DateTime.fromISO(dateKey).toJSDate();
          const dayOfWeek = DateTime.fromISO(dateKey).toFormat('EEEE').toLowerCase();

          toInsert.push({
            mentorId: input.mentorId,
            date,
            dayOfWeek,
            isRecurring: false,
            timezone: input.timezone,
            slots: slots.map((s: any) => ({
              startTime: s.startTime,
              endTime: s.endTime,
              isBooked: false,
              isBlocked: false,
            })),
          });
        } catch (validationError: any) {
          results.failed++;
          results.errors.push(`${dateKey}: ${validationError.message}`);
        }
      }

      // Step 3: Batch insert all valid availability records at once
      if (toInsert.length > 0) {
        try {
          await Availability.insertMany(toInsert, { ordered: false });
          results.created = toInsert.length;
        } catch (bulkError: any) {
          // ordered: false means partial inserts succeed
          const writeErrors = bulkError?.writeErrors || [];
          const failedCount = writeErrors.length;
          results.created = toInsert.length - failedCount;
          results.failed += failedCount;
          writeErrors.forEach((e: any) => {
            results.errors.push(`Batch insert error at index ${e.index}: ${e.errmsg}`);
          });
        }
      }

      logger.info(
        `Bulk create complete: ${results.created} created, ${results.failed} failed`
      );
      return results;
    } catch (error: any) {
      logger.error(`Bulk create availability failed: ${error.message}`);
      throw error;
    }
  }

  async getAllAvailabilityFromDB(page: number = 1, limit: number = 10): Promise<any> {
    try {
      logger.info('Fetching all availability from database');

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        availabilityRepository.findAll({}, skip, limit),
        availabilityRepository.count({}),
      ]);

      return { data, total, page, limit };
    } catch (error: any) {
      logger.error(`Failed to fetch all availability: ${error.message}`);
      throw error;
    }
  }

  async getMentorAvailability(
    mentorId: string,
    filters: AvailabilityFilters = {}
  ): Promise<any[]> {
    try {
      logger.info(`Fetching availability for mentor: ${mentorId}`);

      // ✅ FIX: Push status filter into DB query — don't fetch everything then filter in JS
      const query: any = { mentorId };

      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) query.date.$gte = filters.startDate;
        if (filters.endDate) query.date.$lte = filters.endDate;
      }

      if (filters.status === 'available') {
        query['slots'] = { $elemMatch: { isBooked: false, isBlocked: false } };
      } else if (filters.status === 'booked') {
        query['slots'] = { $elemMatch: { isBooked: true } };
      } else if (filters.status === 'blocked') {
        query['slots'] = { $elemMatch: { isBlocked: true } };
      }

      const availabilities = await availabilityRepository.findByMentorId(mentorId, query);

      logger.info(`Found ${availabilities.length} availability records`);
      return availabilities;
    } catch (error: any) {
      logger.error(`Failed to fetch availability: ${error.message}`);
      throw error;
    }
  }

  async getAvailableSlots(
    mentorId: string,
    date: Date,
    timezone?: string
  ): Promise<Array<{ startTime: string; endTime: string; duration: number }>> {
    try {
      logger.info(`Fetching available slots for mentor: ${mentorId} on ${date}`);

      const availability = await availabilityRepository.findByMentorAndDate(
        mentorId,
        DateTime.fromJSDate(date).startOf('day').toJSDate(),
        DateTime.fromJSDate(date).endOf('day').toJSDate()
      );

      if (!availability) return [];

      const availableSlots = (availability as any).getAvailableSlots();

      if (timezone && timezone !== availability.timezone) {
        return availableSlots.map((slot: any) => {
          const startTimeConverted = TimezoneUtils.convertTimeString(
            slot.startTime,
            date,
            availability.timezone,
            timezone
          );
          const endTimeConverted = TimezoneUtils.convertTimeString(
            slot.endTime,
            date,
            availability.timezone,
            timezone
          );
          return {
            startTime: startTimeConverted,
            endTime: endTimeConverted,
            duration: TimezoneUtils.getDurationInMinutes(startTimeConverted, endTimeConverted),
          };
        });
      }

      return availableSlots.map((slot: any) => ({
        ...slot,
        duration: TimezoneUtils.getDurationInMinutes(slot.startTime, slot.endTime),
      }));
    } catch (error: any) {
      logger.error(`Failed to fetch available slots: ${error.message}`);
      throw error;
    }
  }

  async updateAvailability(
    availabilityId: string,
    updates: Partial<CreateAvailabilityInput>
  ): Promise<any> {
    try {
      logger.info(`Updating availability: ${availabilityId}`);

      let finalUpdates = { ...updates };

      if (updates.slots) {
        /**
         * TEMP FIX:
         * Preserve booked/blocked slots using the latest database state.
         * Prevents stale frontend data from overwriting active bookings
         * during availability updates.
         */
        // OLD IMPLEMENTATION: this.validateSlots(updates.slots);
        
        const existingDoc = await availabilityRepository.findByAvailabilityId(availabilityId);
        if (!existingDoc) {
          throw new NotFoundError('Availability not found');
        }

        const preservedSlots = existingDoc.slots.filter(
          (s: any) => s.isBooked || s.isBlocked
        );

        const incomingSlots = updates.slots.filter(
          (incoming: any) => !preservedSlots.some((ps: any) => ps.startTime === incoming.startTime)
        );

        finalUpdates.slots = [...incomingSlots, ...preservedSlots] as any;

        // ✅ FIX: Overlap check runs on the final merged array
        this.validateSlots(finalUpdates.slots);
      }

      const availability = await availabilityRepository.updateByAvailabilityId(
        availabilityId,
        finalUpdates
      );

      if (!availability) {
        throw new NotFoundError('Availability not found');
      }

      logger.info(`Availability updated: ${availabilityId}`);
      return availability;
    } catch (error: any) {
      logger.error(`Failed to update availability: ${error.message}`);
      throw error;
    }
  }

  async deleteAvailability(availabilityId: string): Promise<void> {
    try {
      logger.info(`Deleting availability: ${availabilityId}`);

      const availability = await availabilityRepository.findByAvailabilityId(availabilityId);

      if (!availability) {
        throw new NotFoundError('Availability not found');
      }

      const hasBookedSlots = availability.slots.some((slot: any) => slot.isBooked);
      if (hasBookedSlots) {
        throw new BadRequestError('Cannot delete availability with booked slots');
      }

      const deleted = await availabilityRepository.softDeleteByAvailabilityId(availabilityId);

      if (!deleted) {
        throw new NotFoundError('Availability not found');
      }

      logger.info(`Availability deleted: ${availabilityId}`);
    } catch (error: any) {
      logger.error(`Failed to delete availability: ${error.message}`);
      throw error;
    }
  }

  async getAvailabilityStats(mentorId: string): Promise<any> {
    try {
      return await availabilityRepository.getStatsByMentorId(mentorId);
    } catch (error: any) {
      logger.error(`Failed to get availability stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate slot format and check for overlaps within the same availability record.
   *
   * ✅ FIX: Added O(n²) overlap check between slots.
   * Prevents mentor being double-booked within the same day
   * (e.g. 09:00-10:00 and 09:30-10:30 would be caught here).
   */
  private validateSlots(slots: Array<{ startTime: string; endTime: string }>): void {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

    // Pass 1: format + basic order validation
    slots.forEach((slot, index) => {
      if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
        throw new BadRequestError(
          `Invalid time format in slot ${index + 1}. Use HH:mm`
        );
      }

      const startMinutes = this.timeToMinutes(slot.startTime);
      const endMinutes = this.timeToMinutes(slot.endTime);

      if (startMinutes >= endMinutes) {
        throw new BadRequestError(
          `Invalid time range in slot ${index + 1}. Start time must be before end time`
        );
      }
    });

    // Pass 2: overlap check between all slot pairs
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const aStart = this.timeToMinutes(slots[i].startTime);
        const aEnd   = this.timeToMinutes(slots[i].endTime);
        const bStart = this.timeToMinutes(slots[j].startTime);
        const bEnd   = this.timeToMinutes(slots[j].endTime);

        // Overlap condition: A starts before B ends AND A ends after B starts
        if (aStart < bEnd && aEnd > bStart) {
          throw new BadRequestError(
            `Slots ${i + 1} and ${j + 1} overlap: ` +
            `${slots[i].startTime}-${slots[i].endTime} conflicts with ` +
            `${slots[j].startTime}-${slots[j].endTime}`
          );
        }
      }
    }
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

export default new AvailabilityService();