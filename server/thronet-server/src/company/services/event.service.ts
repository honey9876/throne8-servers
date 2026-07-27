import { Types } from 'mongoose';
import { Company } from '../models';
import NotificationService from './notification.service';
import logger from '@/shared/logger.util';
import { CreateEventDTO, UpdateEventDTO, EventFilterQuery } from '../interfaces';
import CacheUtil from '@/shared/cache.util';
import eventRepository from '../repositories/event.repository';
import companyRepository from '../repositories/company.repository';
import employeeRepository from '../repositories/employee.repository';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

class EventService {
  private CACHE_PREFIX = 'event:';
  private CACHE_TTL = 3600;

  // =====================================================
  // CREATE EVENT
  // =====================================================
  async createEvent(dto: CreateEventDTO, companyUUID: string): Promise<any> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      // ── Media Upload (same as PostService) ──
      const uploadedMedia: Array<{
        url: string; type: 'Image' | 'Video' | 'Document';
        name?: string; size?: number; caption?: string; isPrimary?: boolean;
      }> = [];

      if (dto.images && dto.images.length > 0) {
        for (const file of dto.images) {
          const result = await this.uploadToCloudinary(file.buffer, 'event-images', 'image');
          uploadedMedia.push({ url: result.secure_url, type: 'Image', isPrimary: uploadedMedia.length === 0 });
        }
      }

      if (dto.videos && dto.videos.length > 0) {
        for (const file of dto.videos) {
          const result = await this.uploadToCloudinary(file.buffer, 'event-videos', 'video');
          uploadedMedia.push({ url: result.secure_url, type: 'Video' });
        }
      }

      if (dto.documents && dto.documents.length > 0) {
        for (const file of dto.documents) {
          const result = await this.uploadToCloudinary(file.buffer, 'event-documents', 'raw');
          uploadedMedia.push({
            url: result.secure_url,
            type: 'Document',
            name: file.originalname,
            size: file.size,
          });
        }
      }

      // ── Scheduled Event Setup (same as PostService) ──
      let eventStatus = dto.status || 'Upcoming';
      let scheduledFor: Date | undefined;
      let isPublished = false;

      if (dto.scheduledFor) {
        const scheduledDate = new Date(dto.scheduledFor);
        if (scheduledDate > new Date()) {
          eventStatus = 'Scheduled';   // ← EventStatus enum mein ye add karna hoga
          scheduledFor = scheduledDate;
          isPublished = false;
        }
      } else {
        isPublished = true;
        // publishedAt set hoga
      }

      // ── Clean dto (multer files remove karo) ──
      const { companyId: _companyId, images: _i, videos: _v, documents: _d, ...cleanDto } = dto;
      
      const event = await eventRepository.create({
        ...cleanDto,
        company: company._id,
        status: eventStatus,
        isPublished,
        publishedAt: isPublished ? new Date() : undefined,
        scheduledFor,
        ...(uploadedMedia.length > 0 && { media: uploadedMedia }),
      });

      await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:${company._id}:*`);

      // notification
      const populated = await eventRepository.findByObjectId(event._id.toString());
      if (populated) {
        const notifEvent = this.toNotificationEvent(populated);
        await NotificationService.sendEventCreated(notifEvent).catch(err =>
          logger.error('Notification error:', err)
        );
      }

      logger.info(`Event created: ${event._id}`);
      return populated || event;
    } catch (error: any) {
      logger.error('Error creating event:', error);
      throw error;
    }
  }

  // ── Add this private helper (same as PostService) ──
  private async uploadToCloudinary(
    buffer: Buffer,
    folder: string,
    resourceType: 'image' | 'video' | 'raw'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType, overwrite: false },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(buffer);
    });
  }

  // =====================================================
  // GET EVENT BY ID (ObjectId aayega middleware se)
  // =====================================================
  async getEventById(objectId: string): Promise<any> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${objectId}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const event = await eventRepository.findByObjectId(objectId);
      if (event) await CacheUtil.set(cacheKey, event, this.CACHE_TTL);

      return event;
    } catch (error: any) {
      logger.error(`Error fetching event ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // GET EVENTS BY COMPANY (companyObjectId middleware se)
  // =====================================================
  async getEventsByCompany(
    companyObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<{ events: any[]; total: number; pages: number }> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}company:${companyObjectId}:page${page}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const skip = (page - 1) * pageSize;
      const [events, total] = await eventRepository.findByCompanyObjectId(
        companyObjectId, skip, pageSize
      );

      const result = { events, total, pages: Math.ceil(total / pageSize) };
      await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      logger.error(`Error fetching company events:`, error);
      throw error;
    }
  }

  // =====================================================
  // FILTER EVENTS
  // =====================================================
  async filterEvents(
    filters: EventFilterQuery
  ): Promise<{ events: any[]; total: number; pages: number }> {
    try {
      const page = filters.page || 1;
      const pageSize = filters.pageSize || 20;
      const skip = (page - 1) * pageSize;

      const query: Record<string, unknown> = {
        status: { $in: ['Upcoming', 'Ongoing'] },
      };

      if (filters.company) query.company = filters.company;
      if (filters.type) query.type = filters.type;
      if (filters.mode) query.mode = filters.mode;
      if (filters.status) query.status = filters.status;
      if (filters.city) query['location.city'] = filters.city;

      const [events, total] = await eventRepository.findWithFilters(query, skip, pageSize);
      return { events, total, pages: Math.ceil(total / pageSize) };
    } catch (error: any) {
      logger.error('Error filtering events:', error);
      throw error;
    }
  }

  // =====================================================
  // GET UPCOMING EVENTS
  // =====================================================
  async getUpcomingEvents(
    page = 1,
    pageSize = 20
  ): Promise<{ events: any[]; total: number }> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}upcoming:page${page}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) return cached;

      const skip = (page - 1) * pageSize;
      const [events, total] = await eventRepository.findUpcoming(skip, pageSize);

      const result = { events, total };
      await CacheUtil.set(cacheKey, result, 600);
      return result;
    } catch (error: any) {
      logger.error('Error fetching upcoming events:', error);
      throw error;
    }
  }

  // =====================================================
  // GET PAST EVENTS
  // =====================================================
  async getPastEvents(
    page = 1,
    pageSize = 20
  ): Promise<{ events: any[]; total: number }> {
    try {
      const skip = (page - 1) * pageSize;
      const [events, total] = await eventRepository.findPast(skip, pageSize);
      return { events, total };
    } catch (error: any) {
      logger.error('Error fetching past events:', error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE EVENT (ObjectId aayega middleware se)
  // =====================================================
  async updateEvent(objectId: string, dto: UpdateEventDTO): Promise<any> {
    try {
      const event = await eventRepository.updateByObjectId(objectId, dto);
      if (!event) throw new Error('Event not found');

      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
      const companyId = this.extractCompanyId(event.company);
      if (companyId) await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:${companyId}:*`);

      return event;
    } catch (error: any) {
      logger.error(`Error updating event ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // DELETE EVENT (ObjectId aayega middleware se)
  // =====================================================
  async deleteEvent(objectId: string): Promise<void> {
    try {
      const event = await eventRepository.findByObjectId(objectId);
      if (!event) throw new Error('Event not found');

      await eventRepository.deleteByObjectId(objectId);

      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
      const companyId = this.extractCompanyId(event.company);
      if (companyId) await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:${companyId}:*`);
    } catch (error: any) {
      logger.error(`Error deleting event ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // SEARCH EVENTS
  // =====================================================
  async searchEvents(
    searchTerm: string,
    page = 1,
    pageSize = 20
  ): Promise<{ events: any[]; total: number }> {
    try {
      const skip = (page - 1) * pageSize;
      const [events, total] = await eventRepository.searchByText(searchTerm, skip, pageSize);
      return { events, total };
    } catch (error: any) {
      logger.error('Error searching events:', error);
      throw error;
    }
  }

  // =====================================================
  // FIND NEARBY EVENTS
  // =====================================================
  async findNearbyEvents(
    longitude: number,
    latitude: number,
    maxDistance = 50000
  ): Promise<any[]> {
    try {
      return eventRepository.findNearby(longitude, latitude, maxDistance);
    } catch (error: any) {
      logger.error('Error finding nearby events:', error);
      throw error;
    }
  }

  // =====================================================
  // REGISTER FOR EVENT (ObjectId aayega middleware se)
  // =====================================================
  async registerForEvent(
    objectId: string,
    employeeId: string,  // ← ye UUID aa raha hai
    email: string
  ): Promise<any> {
    try {
      const existing = await eventRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Event not found');

      if (existing.capacity && existing.registeredCount >= existing.capacity) {
        throw new Error('Event is at full capacity');
      }

      // ✅ UUID → ObjectId resolve karo
      const employee = await employeeRepository.findByUUID(employeeId);
      if (!employee) throw new Error('Employee not found');

      const employeeObjectId = employee._id; // ← ab ye valid ObjectId hai

      // duplicate check
      const alreadyRegistered = (existing.registrations || []).some(
        (reg: any) => reg.employee?.toString() === employeeObjectId.toString()
      );
      if (alreadyRegistered) throw new Error('Already registered for this event');

      const updated = await eventRepository.registerAttendee(objectId, {
        employee: employeeObjectId,  // ✅ ObjectId pass karo
        email,
        registeredAt: new Date(),
      });

      if (updated) {
        const notifEvent = this.toNotificationEvent(updated);
        await NotificationService.sendRegistrationConfirmation(notifEvent, email).catch(err =>
          logger.error('Notification error:', err)
        );
      }

      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
      return updated;
    } catch (error: any) {
      logger.error(`Error registering for event ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // CANCEL REGISTRATION (ObjectId aayega middleware se)
  // =====================================================
  async cancelRegistration(objectId: string, employeeId: string): Promise<any> {
    try {
      const existing = await eventRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Event not found');

      // ✅ UUID → ObjectId
      const employee = await employeeRepository.findByUUID(employeeId);
      if (!employee) throw new Error('Employee not found');

      const updated = await eventRepository.cancelRegistration(
        objectId,
        employee._id.toString()  // ✅ ObjectId string pass karo
      );

      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
      return updated;
    } catch (error: any) {
      logger.error(`Error canceling registration:`, error);
      throw error;
    }
  }

  // =====================================================
  // GET ATTENDEES (ObjectId aayega middleware se)
  // =====================================================
  async getAttendees(
    objectId: string,
    page = 1,
    pageSize = 20
  ): Promise<{ attendees: any[]; total: number }> {
    try {
      const event = await eventRepository.findByObjectId(objectId);
      if (!event) throw new Error('Event not found');

      const skip = (page - 1) * pageSize;
      const allRegistrations = event.registrations || [];
      const attendees = allRegistrations.slice(skip, skip + pageSize);

      return { attendees, total: allRegistrations.length };
    } catch (error: any) {
      logger.error(`Error fetching attendees:`, error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE EVENT STATUS (ObjectId aayega middleware se)
  // =====================================================
  async updateEventStatus(objectId: string, status: string): Promise<any> {
    try {
      const event = await eventRepository.updateByObjectId(objectId, { status } as any);
      if (!event) throw new Error('Event not found');

      if (status === 'Cancelled') {
        const notifEvent = this.toNotificationEvent(event);
        await NotificationService.sendEventCancellation(notifEvent).catch(err =>
          logger.error('Notification error:', err)
        );
      }

      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
      return event;
    } catch (error: any) {
      logger.error(`Error updating event status:`, error);
      throw error;
    }
  }

  // =====================================================
  // GET STATISTICS
  // =====================================================
  async getEventStatistics(companyObjectId?: string): Promise<any> {
    try {
      return eventRepository.getStatistics(companyObjectId);
    } catch (error: any) {
      logger.error('Error fetching event statistics:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPERS
  // =====================================================
  private extractCompanyId(company: any): string | null {
    if (!company) return null;
    if (company instanceof Types.ObjectId) return company.toString();
    if (typeof company === 'object' && company._id) return company._id.toString();
    return null;
  }

  private toNotificationEvent(event: any): any {
    const company = event.company || {};
    return {
      _id: event._id?.toString(),
      title: event.title,
      slug: event.slug,
      company: {
        name: company.name || company.companyName || '',
        email: company.email || '',
      },
      startDate: event.startDate,
      endDate: event.endDate,
      mode: event.mode,
      type: event.type,
      location: event.location,
      registrations: event.registrations,
    };
  }
}

export default new EventService();