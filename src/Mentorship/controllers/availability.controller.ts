import { Request, Response } from 'express';
import { getAuthToken } from '@/shared/middlewares/auth.middleware';
import { availabilityService, mentorService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';


class AvailabilityController {
  async createAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId, date, slots, timezone, isRecurring, dayOfWeek } = req.body;

      const availability = await availabilityService.createAvailability({
        mentorId: String(mentorId),
        date: new Date(String(date)),
        slots: slots as Array<{ startTime: string; endTime: string }>,
        timezone: String(timezone),
        isRecurring,
        dayOfWeek,
      });

      ResponseHandler.created(res, 'Availability created successfully', availability);
    } catch (error: any) {
      logger.error('Create availability error:', error);
      ResponseHandler.error(res, 'Failed to create availability', 500, error);
    }
  }

  async bulkCreateAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId, dateRange, slotConfig, daysOfWeek, timezone } = req.body;

      const result = await availabilityService.bulkCreateAvailability({
        mentorId: String(mentorId),
        dateRange: {
          startDate: new Date(dateRange.startDate),
          endDate: new Date(dateRange.endDate),
        },
        slotConfig,
        daysOfWeek,
        timezone: String(timezone),
      });

      ResponseHandler.success(res, 'Bulk availability creation completed', result);
    } catch (error: any) {
      logger.error('Bulk create availability error:', error);
      ResponseHandler.error(res, 'Failed to create bulk availability', 500, error);
    }
  }

  async getAllAvailabilityFromDB(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await availabilityService.getAllAvailabilityFromDB(page, limit);

      ResponseHandler.paginated(res, 'All availability fetched successfully', result.data, result.page, result.limit, result.total);
    } catch (error: any) {
      logger.error('Get all availability error:', error);
      ResponseHandler.error(res, 'Failed to fetch availability', 500, error);
    }
  }

  async getMentorAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { startDate, endDate, status } = req.query;

      const filters: any = {};
      if (startDate && typeof startDate === 'string') {
        filters.startDate = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        filters.endDate = new Date(endDate);
      }
      if (status) filters.status = status;

      const availabilities = await availabilityService.getMentorAvailability(
        String(mentorId),
        filters
      );

      ResponseHandler.success(res, 'Availability fetched successfully', {
        availabilities,
        count: availabilities.length,
      });
    } catch (error: any) {
      logger.error('Get mentor availability error:', error);
      ResponseHandler.error(res, 'Failed to fetch availability', 500, error);
    }
  }

  async getAvailableSlots(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;
      const { date, timezone } = req.query;

      if (!date || typeof date !== 'string') {
        ResponseHandler.badRequest(res, 'Date is required');
        return;
      }

      const slots = await availabilityService.getAvailableSlots(
        String(mentorId),
        new Date(date),
        timezone as string | undefined
      );

      ResponseHandler.success(res, 'Available slots fetched successfully', {
        date,
        slots,
        count: slots.length,
      });
    } catch (error: any) {
      logger.error('Get available slots error:', error);
      ResponseHandler.error(res, 'Failed to fetch available slots', 500, error);
    }
  }

  async updateAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { availabilityId } = req.params;
      const updates = req.body;

      if (updates.date) {
        updates.date = new Date(updates.date);
      }

      const availability = await availabilityService.updateAvailability(
        String(availabilityId),
        updates
      );

      ResponseHandler.success(res, 'Availability updated successfully', availability);
    } catch (error: any) {
      logger.error('Update availability error:', error);
      ResponseHandler.error(res, 'Failed to update availability', 500, error);
    }
  }

  async deleteAvailability(req: Request, res: Response): Promise<void> {
    try {
      const { availabilityId } = req.params;

      await availabilityService.deleteAvailability(String(availabilityId));

      ResponseHandler.success(res, 'Availability deleted successfully');
    } catch (error: any) {
      logger.error('Delete availability error:', error);
      ResponseHandler.error(res, 'Failed to delete availability', 500, error);
    }
  }

  async getAvailabilityStats(req: Request, res: Response): Promise<void> {
    try {
      const { mentorId } = req.params;

      const stats = await availabilityService.getAvailabilityStats(String(mentorId));

      ResponseHandler.success(res, 'Availability stats fetched successfully', stats);
    } catch (error: any) {
      logger.error('Get availability stats error:', error);
      ResponseHandler.error(res, 'Failed to fetch availability stats', 500, error);
    }
  }

  async compareMentors(req: Request, res: Response): Promise<void> {
    try {
      const { mentorIds } = req.body;
      const authToken = getAuthToken(req);

      if (!mentorIds || !Array.isArray(mentorIds) || mentorIds.length === 0) {
        ResponseHandler.badRequest(res, 'Mentor IDs are required');
        return;
      }

      if (mentorIds.length > 3) {
        ResponseHandler.badRequest(res, 'Maximum 3 mentors can be compared');
        return;
      }

      const mentors = await Promise.all(
        mentorIds.map((id: string) => mentorService.getMentorById(String(id), authToken || ''))
      );

      const comparison = mentors.map((mentor) => ({
        mentorId: mentor._id,
        name: mentor.user?.name || 'N/A',
        company: mentor.company?.name || 'N/A',
        title: mentor.title,
        experience: mentor.experience.total,
        rating: mentor.stats.averageRating,
        totalSessions: mentor.stats.totalSessions,
        responseTime: mentor.stats.responseTime,
        completionRate: mentor.stats.completionRate,
        pricing: {
          quickCall: mentor.pricing?.quickCall,
          deepDive: mentor.pricing?.deepDive,
          resumeReview: mentor.pricing?.resumeReview,
          mockInterview: mentor.pricing?.mockInterview,
        },
        languages: mentor.languages,
        skills: mentor.skills,
        domains: mentor.domains,
      }));

      ResponseHandler.success(res, 'Mentor comparison fetched successfully', {
        mentors: comparison,
        count: comparison.length,
      });
    } catch (error: any) {
      logger.error('Compare mentors error:', error);
      ResponseHandler.error(res, 'Failed to compare mentors', 500, error);
    }
  }
}

export default new AvailabilityController();