import { Request, Response } from 'express';
import logger from '@/shared/logger.util';
import { CreateEventDTO, UpdateEventDTO, EventFilterQuery, EventStatus } from '../interfaces';
import { eventService } from '../services';
import ResponseUtil from '@/shared/response.util';
import { EventMode } from '../interfaces/event.types';
import { EventType } from '../interfaces/event.types';

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

class EventController {

  // =====================================================
  // CREATE EVENT — company UUID body se aayega
  // =====================================================
  async createEvent(req: Request, res: Response): Promise<void> {
    try {
      const companyUUID: string = req.body.companyId;

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

      const dto: CreateEventDTO = {
        ...req.body,
        images: files?.['images'],
        videos: files?.['videos'],
        documents: files?.['documents'],
      };

      const event = await eventService.createEvent(dto, companyUUID);
      ResponseUtil.created(res, event, 'Event created successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error creating event:`, error);
      if (error.message === 'Company not found') {
        ResponseUtil.notFound(res, 'Company not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to create event');
      }
    }
  }

  // =====================================================
  // GET EVENT BY ID ✅ resolvedObjectId use karo
  // =====================================================
  async getEventById(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      const event = await eventService.getEventById(objectId);
      if (!event) {
        ResponseUtil.notFound(res, 'Event not found');
        return;
      }

      ResponseUtil.success(res, event, 'Event fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching event:`, error);
      ResponseUtil.error(res, error.message || 'Failed to fetch event');
    }
  }

  // =====================================================
  // LIST EVENTS — NO CHANGE
  // =====================================================
  async listEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const filters: EventFilterQuery = {
        page,
        pageSize,
        company: req.query.company as string,
        type: req.query.type as EventType | undefined,
        mode: req.query.mode as EventMode | undefined,
        status: req.query.status as EventStatus | undefined,
        city: req.query.city as string,
        search: req.query.search as string,
      };

      const { events, total, pages } = await eventService.filterEvents(filters);

      ResponseUtil.success(res, {
        events,
        meta: {
          page, pageSize, total,
          totalPages: pages,
          hasMore: page < pages,
        },
      }, 'Events fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error listing events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to list events');
    }
  }

  // =====================================================
  // GET COMPANY EVENTS ✅ resolvedObjectId use karo
  // =====================================================
  async getCompanyEvents(req: Request, res: Response): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId;
      if (!companyObjectId) {
        ResponseUtil.badRequest(res, 'Company not found');
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const { events, total, pages } = await eventService.getEventsByCompany(
        companyObjectId, page, pageSize
      );

      ResponseUtil.success(res, {
        events,
        meta: {
          page, pageSize, total,
          totalPages: pages,
          hasMore: page < pages,
        },
      }, 'Company events fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching company events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to fetch company events');
    }
  }

  // =====================================================
  // GET UPCOMING EVENTS — NO CHANGE
  // =====================================================
  async getUpcomingEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const { events, total } = await eventService.getUpcomingEvents(page, pageSize);

      ResponseUtil.success(res, {
        events,
        meta: {
          page, pageSize, total,
          totalPages: Math.ceil(total / pageSize),
          hasMore: page < Math.ceil(total / pageSize),
        },
      }, 'Upcoming events fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching upcoming events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to fetch upcoming events');
    }
  }

  // =====================================================
  // GET PAST EVENTS — NO CHANGE
  // =====================================================
  async getPastEvents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const { events, total } = await eventService.getPastEvents(page, pageSize);

      ResponseUtil.success(res, {
        events,
        meta: {
          page, pageSize, total,
          totalPages: Math.ceil(total / pageSize),
          hasMore: page < Math.ceil(total / pageSize),
        },
      }, 'Past events fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching past events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to fetch past events');
    }
  }

  // =====================================================
  // UPDATE EVENT ✅ resolvedObjectId use karo
  // =====================================================
  async updateEvent(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const dto: UpdateEventDTO = req.body;

      const event = await eventService.updateEvent(objectId, dto);
      ResponseUtil.success(res, event, 'Event updated successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error updating event:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to update event');
      }
    }
  }

  // =====================================================
  // DELETE EVENT ✅ resolvedObjectId use karo
  // =====================================================
  async deleteEvent(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;

      await eventService.deleteEvent(objectId);
      ResponseUtil.success(res, null, 'Event deleted successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error deleting event:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to delete event');
      }
    }
  }

  // =====================================================
  // SEARCH EVENTS — NO CHANGE
  // =====================================================
  async searchEvents(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      if (!q) {
        ResponseUtil.badRequest(res, 'Search query is required');
        return;
      }

      const { events, total } = await eventService.searchEvents(q as string, page, pageSize);

      ResponseUtil.success(res, {
        events,
        meta: {
          page, pageSize, total,
          totalPages: Math.ceil(total / pageSize),
          hasMore: page < Math.ceil(total / pageSize),
        },
      }, 'Search results fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error searching events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to search events');
    }
  }

  // =====================================================
  // FIND NEARBY EVENTS — NO CHANGE
  // =====================================================
  async findNearbyEvents(req: Request, res: Response): Promise<void> {
    try {
      const { longitude, latitude, maxDistance } = req.query;

      const events = await eventService.findNearbyEvents(
        parseFloat(longitude as string),
        parseFloat(latitude as string),
        maxDistance ? parseInt(maxDistance as string) : 50000
      );

      ResponseUtil.success(res, {
        events,
        meta: { page: 1, pageSize: events.length, total: events.length, totalPages: 1, hasMore: false },
      }, 'Nearby events fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error finding nearby events:`, error);
      ResponseUtil.error(res, error.message || 'Failed to find nearby events');
    }
  }

  // =====================================================
  // REGISTER FOR EVENT ✅ resolvedObjectId use karo
  // =====================================================
  async registerForEvent(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { employeeId, email } = req.body;

      const event = await eventService.registerForEvent(objectId, employeeId, email);
      ResponseUtil.success(res, event, 'Registered for event successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error registering for event:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else if (error.message === 'Event is at full capacity') {
        ResponseUtil.conflict(res, 'Event is at full capacity');
      } else if (error.message === 'Already registered for this event') {
        ResponseUtil.conflict(res, 'Already registered for this event');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to register for event');
      }
    }
  }

  // =====================================================
  // CANCEL REGISTRATION ✅ resolvedObjectId use karo
  // =====================================================
  async cancelRegistration(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { employeeId } = req.body;

      const event = await eventService.cancelRegistration(objectId, employeeId);
      ResponseUtil.success(res, event, 'Registration cancelled successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error canceling registration:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to cancel registration');
      }
    }
  }

  // =====================================================
  // GET ATTENDEES ✅ resolvedObjectId use karo
  // =====================================================
  async getAttendees(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const { attendees, total } = await eventService.getAttendees(objectId, page, pageSize);

      ResponseUtil.success(res, {
        attendees,
        meta: {
          page, pageSize, total,
          totalPages: Math.ceil(total / pageSize),
          hasMore: page < Math.ceil(total / pageSize),
        },
      }, 'Attendees fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching attendees:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to fetch attendees');
      }
    }
  }

  // =====================================================
  // UPDATE EVENT STATUS ✅ resolvedObjectId use karo
  // =====================================================
  async updateEventStatus(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId;
      const { status } = req.body;

      const event = await eventService.updateEventStatus(objectId, status);
      ResponseUtil.success(res, event, 'Event status updated successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error updating event status:`, error);
      if (error.message === 'Event not found') {
        ResponseUtil.notFound(res, 'Event not found');
      } else {
        ResponseUtil.error(res, error.message || 'Failed to update event status');
      }
    }
  }

  // =====================================================
  // GET STATISTICS — NO CHANGE (query param)
  // =====================================================
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const companyObjectId = req.query.companyId as string | undefined;
      const stats = await eventService.getEventStatistics(companyObjectId);
      ResponseUtil.success(res, stats, 'Event statistics fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error fetching statistics:`, error);
      ResponseUtil.error(res, error.message || 'Failed to fetch statistics');
    }
  }
}

export const eventController = new EventController();