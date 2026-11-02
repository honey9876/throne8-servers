import communityEventRepository from '@/Mentorship/repositories/communityEvent.repository';
import { CreateCommunityEventDTO, UpdateCommunityEventDTO, CommunityEventListQuery } from '@/Mentorship/interface/communityEvent.types';
import { AppError } from '@/shared/errors/app.error';
import { logger } from '@/shared/logger.util';
import notificationService, { NotificationType, NotificationChannel } from '@/Mentorship/services/notification.service';
import EventRSVP from '@/Mentorship/models/EventRSVP';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

class CommunityEventService {
  async uploadImageToCloudinary(buffer: Buffer, identifier: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'community-events',
          public_id: `event_${identifier}_${Date.now()}`,
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 800, crop: 'limit' },
            { quality: 'auto:good' },
          ],
          overwrite: true,
        },
        (error: any, result: any) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  async createEvent(userId: string, data: CreateCommunityEventDTO) {
    const eventDate = new Date(data.date);
    if (eventDate.getTime() < Date.now()) {
      throw new AppError('Event date cannot be in the past', 400);
    }
    return communityEventRepository.create(userId, data);
  }

  async getEvent(id: string) {
    const event = await communityEventRepository.findById(id);
    if (!event) throw new AppError('Community event not found', 404);
    return event;
  }

  async listEvents(query: CommunityEventListQuery) {
    return communityEventRepository.list(query);
  }

  async updateEvent(id: string, requesterId: string, isAdmin: boolean, data: UpdateCommunityEventDTO) {
    const event = await communityEventRepository.findById(id);
    if (!event) throw new AppError('Community event not found', 404);
    const creatorIdUpdate = typeof event.createdBy === 'object' && event.createdBy !== null
      ? (event.createdBy as any).userId || String(event.createdBy)
      : String(event.createdBy);
    if (!isAdmin && creatorIdUpdate !== requesterId) {
      throw new AppError('Not authorized to update this event', 403);
    }
    return communityEventRepository.update(id, data);
  }

  async cancelEvent(id: string, requesterId: string, isAdmin: boolean) {
    const event = await communityEventRepository.findById(id);
    if (!event) throw new AppError('Community event not found', 404);
    const creatorIdCancel = typeof event.createdBy === 'object' && event.createdBy !== null
      ? (event.createdBy as any).userId || String(event.createdBy)
      : String(event.createdBy);
    if (!isAdmin && creatorIdCancel !== requesterId) {
      throw new AppError('Not authorized to cancel this event', 403);
    }
    const cancelled = await communityEventRepository.cancel(id);

    this.notifyAttendeesOfCancellation(id).catch((err) =>
      logger.error('Failed to notify attendees of cancellation:', err)
    );

    return cancelled;
  }

  async deleteEvent(id: string, requesterId: string, isAdmin: boolean) {
    const event = await communityEventRepository.findById(id);
    if (!event) throw new AppError('Community event not found', 404);
    const creatorIdDelete = typeof event.createdBy === 'object' && event.createdBy !== null
      ? (event.createdBy as any).userId || String(event.createdBy)
      : String(event.createdBy);
    if (!isAdmin && creatorIdDelete !== requesterId) {
      throw new AppError('Not authorized to delete this event', 403);
    }
    return communityEventRepository.delete(id);
  }

  async rsvp(eventId: string, userId: string) {
    const event = await communityEventRepository.findById(eventId);
    if (!event) throw new AppError('Community event not found', 404);
    if (event.isCancelled) throw new AppError('This event has been cancelled', 400);
    if (event.date.getTime() < Date.now()) throw new AppError('Cannot RSVP to a past event', 400);

    try {
      return await communityEventRepository.rsvp(eventId, userId);
    } catch (error: any) {
      if (error.message === 'EVENT_NOT_FOUND') throw new AppError('Community event not found', 404);
      throw error;
    }
  }

  async cancelRsvp(eventId: string, userId: string) {
    const event = await communityEventRepository.findById(eventId);
    if (!event) throw new AppError('Community event not found', 404);
    return communityEventRepository.cancelRsvp(eventId, userId);
  }

  async isUserGoing(eventId: string, userId: string) {
    return communityEventRepository.isUserGoing(eventId, userId);
  }

  async listAttendees(eventId: string, page?: number, limit?: number) {
    const event = await communityEventRepository.findById(eventId);
    if (!event) throw new AppError('Community event not found', 404);
    return communityEventRepository.listAttendees(eventId, page, limit);
  }

  private async notifyAttendeesOfCancellation(eventId: string) {
    const attendees = await EventRSVP.find({ event: eventId, status: 'going' }).lean();
    await Promise.all(
      attendees.map((a) =>
        notificationService.sendNotification({
          userId: a.user.toString(),
        module: 'industry-mentor',
          type: NotificationType.PROFILE_VIEWED, // TODO: EVENT_CANCELLED type add karke swap karna
          channels: [NotificationChannel.IN_APP],
          priority: 'normal',
          data: {
            title: 'Event Cancelled',
            message: "A community event you RSVP'd to has been cancelled.",
            eventId,
          },
        })
      )
    );
  }
}

export default new CommunityEventService();