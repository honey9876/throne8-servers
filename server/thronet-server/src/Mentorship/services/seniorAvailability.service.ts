import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import seniorAvailabilityRepository from '../repositories/seniorAvailability.repository';
import SeniorSession from '../models/SeniorSession';
import { SeniorSessionStatus, SeniorSessionType } from '../interface/seniorSession.types';
import { CreateSeniorAvailabilityInput, UpdateSeniorAvailabilityInput, SeniorTimeRange, SeniorDateOverride } from '../interface/seniorAvailability.types';

export class SeniorAvailabilityService {
  /**
   * Upsert the user's weekly config
   */
  async upsertConfig(mentorId: string, input: CreateSeniorAvailabilityInput | UpdateSeniorAvailabilityInput) {
    return await seniorAvailabilityRepository.upsert(mentorId, input);
  }

  /**
   * Get configuration
   */
  async getConfig(mentorId: string) {
    return await seniorAvailabilityRepository.getByMentorId(mentorId);
  }
  
  /**
   * Block a specific time manually
   */
  async addBlockedTime(mentorId: string, date: string, startTime: string, endTime: string, reason?: string) {
    const config = await this.getConfig(mentorId);
    if (!config) throw new Error('Senior Mentor availability config not found');
    return await seniorAvailabilityRepository.addBlockedTime(mentorId, { date, startTime, endTime, reason });
  }

  /**
   * Remove a manually blocked time
   */
  async removeBlockedTime(mentorId: string, id: string) {
    return await seniorAvailabilityRepository.removeBlockedTime(mentorId, id);
  }

  /**
   * Check if two time ranges overlap
   */
  private checkOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    return toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);
  }

  /**
   * Internal helper resolving availability for a given date, strictly acting as the
   * single source of truth for both display (getAvailableSlots) and validation (validateSlot).
   */
  async resolveAvailableSlotsForDate(mentorId: string, dateStr: string, sessionDuration: number, options?: { excludeSessionId?: string }): Promise<{ startTime: string, endTime: string, isPast: boolean }[]> {
    const config = await this.getConfig(mentorId);
    if (!config) {
      return []; // No config = no availability
    }

    // 1. Resolve which time ranges apply to this date
    // Check if it's completely overridden
    const override = config.dateOverrides.find(o => o.date === dateStr);
    let timeRanges: SeniorTimeRange[] = [];
    
    if (override) {
      if (!override.enabled) return []; // Date is completely blocked by override
      timeRanges = override.timeRanges;
    } else {
      // Find the weekday using luxon to parse the date in the configured timezone
      const dateInTz = DateTime.fromISO(dateStr, { zone: config.timezone });
      const dayName = dateInTz.setLocale('en-US').toFormat('cccc'); // "Monday", etc
      
      const daySchedule = config.weeklySchedule.find(d => d.day === dayName);
      if (!daySchedule || !daySchedule.enabled) {
        return [];
      }
      timeRanges = daySchedule.timeRanges;
    }

    if (timeRanges.length === 0) return [];

    // 2. Fetch existing sessions to exclude overlapping blocks
    const startRange = DateTime.fromISO(dateStr, { zone: config.timezone }).minus({ days: 1 }).startOf('day').toJSDate();
    const endRange = DateTime.fromISO(dateStr, { zone: config.timezone }).plus({ days: 1 }).endOf('day').toJSDate();

    const existingSessions = await SeniorSession.find({
      mentorId,
      $or: [
        {
          status: { $nin: [SeniorSessionStatus.CANCELLED, SeniorSessionStatus.COMPLETED] },
          scheduledAt: { $gte: startRange, $lte: endRange }
        },
        {
          'bookings': {
            $elemMatch: {
              status: { $in: ['pending', 'confirmed', 'in_progress'] },
              $or: [
                { scheduledAt: { $gte: startRange, $lte: endRange } },
                { scheduledAt: { $exists: false } }
              ]
            }
          }
        }
      ]
    }).lean();

    const sessionBlocks: { startTime: string, endTime: string, duration: number }[] = [];

    existingSessions.forEach((sess: any) => {
      // 1. Root session blocking (for GROUP or other non-one-to-one sessions)
      if (sess.sessionType !== SeniorSessionType.ONE_TO_ONE && sess.scheduledAt) {
        if (!options?.excludeSessionId || sess.sessionId !== options.excludeSessionId) {
          if (![SeniorSessionStatus.CANCELLED, SeniorSessionStatus.COMPLETED].includes(sess.status as SeniorSessionStatus)) {
            const sessStart = DateTime.fromJSDate(sess.scheduledAt).setZone(config.timezone);
            if (sessStart.toISODate() === dateStr) {
              const sessEnd = sessStart.plus({ minutes: sess.duration });
              sessionBlocks.push({
                startTime: sessStart.toFormat('HH:mm'),
                endTime: sessEnd.toFormat('HH:mm'),
                duration: sess.duration
              });
            }
          }
        }
      }

      // 2. Booking blocking (for ALL session types, especially one_to_one)
      if (Array.isArray(sess.bookings)) {
        sess.bookings.forEach((booking: any) => {
          if (['pending', 'confirmed', 'in_progress'].includes(booking.status)) {
            if (booking.scheduledAt) {
              const bStart = DateTime.fromJSDate(booking.scheduledAt).setZone(config.timezone);
              if (bStart.toISODate() === dateStr) {
                const bEnd = bStart.plus({ minutes: sess.duration });
                sessionBlocks.push({
                  startTime: bStart.toFormat('HH:mm'),
                  endTime: bEnd.toFormat('HH:mm'),
                  duration: sess.duration
                });
              }
            } else if (booking.slotTime) {
              const parts = booking.slotTime.split(' - ');
              if (parts.length === 2 && parts[0] && parts[1]) {
                 sessionBlocks.push({
                   startTime: parts[0].trim(),
                   endTime: parts[1].trim(),
                   duration: sess.duration
                 });
              }
            }
          }
        });
      }
    });

    // 3. Add manual blocked times to the exclusions
    const blockedTimes = config.blockedTimes.filter(b => b.date === dateStr);
    const exclusions = [...sessionBlocks, ...blockedTimes];

    // 4. Generate all potential slots and filter them
    const validSlots: { startTime: string, endTime: string, isPast: boolean }[] = [];
    const interval = sessionDuration > 0 ? Number(sessionDuration) : 60;
    
    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const toTimeStr = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const serverNowInTz = DateTime.now().setZone(config.timezone);

    for (const range of timeRanges) {
      let currentMin = toMinutes(range.startTime);
      const endMin = toMinutes(range.endTime);

      const numericSessionDuration = Number(sessionDuration);
      while (currentMin + numericSessionDuration <= endMin) {
        const slotStart = toTimeStr(currentMin);
        const slotEnd = toTimeStr(currentMin + numericSessionDuration);

        let isExcluded = false;
        for (const excl of exclusions) {
          if (this.checkOverlap(slotStart, slotEnd, excl.startTime, excl.endTime)) {
            isExcluded = true;
            break;
          }
        }

        if (!isExcluded) {
          const slotDateTime = DateTime.fromISO(`${dateStr}T${slotStart}:00`, { zone: config.timezone });
          validSlots.push({
            startTime: slotStart,
            endTime: slotEnd,
            isPast: slotDateTime <= serverNowInTz
          });
        }
        currentMin += interval + config.breakDuration;
      }
    }

    return validSlots;
  }

  /**
   * Core logic to fetch valid available slots for a given date
   */
  async getAvailableSlots(mentorId: string, dateStr: string, sessionDuration: number): Promise<{ startTime: string, endTime: string }[]> {
    const slots = await this.resolveAvailableSlotsForDate(mentorId, dateStr, sessionDuration);
    // Filter out past slots for display
    return slots.filter(s => !s.isPast).map(({ startTime, endTime }) => ({ startTime, endTime }));
  }

  /**
   * Monthly availability generator used by CalendarStep
   */
  async getMonthlyAvailability(mentorId: string, startDateStr: string, endDateStr: string, sessionDuration: number = 30): Promise<{ date: string, slots: { startTime: string, endTime: string }[] }[]> {
    const config = await this.getConfig(mentorId);
    if (!config) return [];

    const startDt = DateTime.fromISO(startDateStr, { zone: config.timezone }).startOf('day');
    const endDt = DateTime.fromISO(endDateStr, { zone: config.timezone }).startOf('day');
    
    const results = [];
    let currentDt = startDt;
    
    while (currentDt <= endDt) {
      const dateStr = currentDt.toISODate();
      if (dateStr) {
          const validSlots = await this.resolveAvailableSlotsForDate(mentorId, dateStr, sessionDuration);
          const filteredSlots = validSlots.filter(s => !s.isPast).map(({ startTime, endTime }) => ({ startTime, endTime }));
          if (filteredSlots.length > 0) {
            results.push({
              date: dateStr,
              slots: filteredSlots
            });
          }
      }
      currentDt = currentDt.plus({ days: 1 });
    }
    
    return results;
  }


  /**
   * Validate if a specifically requested time slot is still valid and not overlapping.
   * Called by SeniorSessionService before booking/persisting to avoid race conditions.
   * 
   * @param excludeSessionId Used during UPDATE to prevent the session from blocking itself.
   */
  async validateSlot(mentorId: string, dateStr: string, startTime: string, duration: number, excludeSessionId?: string, payloadContext?: any): Promise<boolean> {
    const toTimeStr = (minutes: number) => {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const numericDuration = Number(duration);
    const startMinStrParts = startTime.split(':').map(Number);
    const startMin = startMinStrParts[0] * 60 + startMinStrParts[1];
    const expectedEndTime = toTimeStr(startMin + numericDuration);

    console.log('\n==================================================');
    console.log('[SENIOR BOOKING VALIDATION]');
    console.log(`mentorId: ${mentorId}`);
    console.log(`requested dateStr: ${dateStr}`);
    console.log(`requested startTime: ${startTime}`);
    console.log(`expected endTime: ${expectedEndTime}`);
    console.log(`duration: ${numericDuration}`);
    console.log(`excludeSessionId: ${excludeSessionId || 'none'}`);

    // Call shared single-source-of-truth resolver
    const candidateSlots = await this.resolveAvailableSlotsForDate(mentorId, dateStr, numericDuration, { excludeSessionId });
    
    // Find exact match enforcing the strict generated grid.
    const exactMatch = candidateSlots.find(s => s.startTime === startTime && s.endTime === expectedEndTime);

    if (!exactMatch) {
      console.log(`validation failure: slot does not exist in generated grid.`);
      console.log('==================================================\n');
      return false; // Rejected: Not an open grid block or heavily blocked.
    }

    if (exactMatch.isPast) {
      console.log(`validation failure: slot is in the past.`);
      console.log('==================================================\n');
      return false; // Rejected: Time is past.
    }

    console.log(`validation success: slot perfectly aligns and is safely open.`);
    console.log('==================================================\n');
    return true; // Clean and valid based on identical shared rules
  }
}

export default new SeniorAvailabilityService();
