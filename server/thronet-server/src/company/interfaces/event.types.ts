// ============================================
// FILE: types/event.types.ts (COMPLETE & FIXED)
// ============================================
import { Types } from 'mongoose';

// Event enums and types
export type EventType = 'Conference' | 'Workshop' | 'Seminar' | 'Webinar' | 'Meetup' | 'Training' | 'Other';
export type EventMode = 'Online' | 'Offline' | 'Hybrid';
export type EventStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';

// Speaker embedded object
export interface ISpeaker {
  name: string;
  designation?: string;
  company?: string;
  bio?: string;
  image?: string;
}

// Location interface
export interface ILocation {
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  address?: string;
  coordinates?: {
    type: string;
    coordinates: number[];
  };
}

// Registration interface
export interface IRegistration {
  employee?: Types.ObjectId;
  email?: string;
  phone?: string;
  registeredAt: Date;
  attended?: boolean;
}

// DTOs for creating events
export interface CreateEventDTO {
  title: string;
  slug?: string;
  description?: string;
  companyId: string;
  type: EventType;
  startDate: Date;
  startTimeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  endDate?: Date;
  endTimeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  mode?: string;
  eventLink?: string;
  banner?: string;
  capacity?: number;
  location?: ILocation;
  status?: EventStatus;
  speakers?: ISpeaker[];
  bannerImage?: string;
  tags?: string[];
  visibility?: 'Public' | 'Private';
  scheduledFor?: Date;
  agenda?: Array<{
    time?: string;
    timeOfDay?: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
    title: string;
    description?: string;
    speaker?: string;
    duration?: number;
  }>;
  // Files (multer se aayenge — controller mein handle honge)
  images?: Express.Multer.File[];
  videos?: Express.Multer.File[];
  documents?: Express.Multer.File[];
}

// DTOs for updating events
export interface UpdateEventDTO {
  title?: string;
  description?: string;
  type?: EventType;
  startDate?: Date;
  endDate?: Date;
  mode?: EventMode;
  location?: ILocation;
  capacity?: number;
  status?: EventStatus;
  speakers?: ISpeaker[];
  bannerImage?: string;
  tags?: string[];
}

// Event filter query - FIXED: Added search field
export interface EventFilterQuery {
  company?: string;
  type?: EventType;
  mode?: EventMode;
  status?: EventStatus;
  city?: string;
  search?: string; // ADDED: Missing field
  page?: number;
  pageSize?: number;
  startDate?: Date;
  endDate?: Date;
}

// Response interfaces for API
export interface EventResponse {
  success: boolean;
  message: string;
  data: {
    _id: string;
    title: string;
    slug: string;
    description?: string;
    company: {
      _id: string;
      name: string;
      logo?: string;
    };
    type: EventType;
    startDate: Date;
    endDate?: Date;
    mode: EventMode;
    location?: ILocation;
    registeredCount: number;
    capacity?: number;
    status: EventStatus;
    speakers?: ISpeaker[];
    bannerImage?: string;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface EventListResponse {
  success: boolean;
  message: string;
  data: {
    events: Array<{
      _id: string;
      title: string;
      slug: string;
      company: {
        _id: string;
        name: string;
        logo?: string;
      };
      type: EventType;
      startDate: Date;
      mode: EventMode;
      location?: {
        venue?: string;
        city?: string;
      };
      registeredCount: number;
      capacity?: number;
      status: EventStatus;
    }>;
    total: number;
    pages?: number;
    currentPage?: number;
  };
}

export interface EventStatsResponse {
  success: boolean;
  message: string;
  data: {
    upcoming: number;
    ongoing: number;
    completed: number;
    total: number;
    avgRegistrations: number;
  };
}

export interface RegisterEventDTO {
  employeeId: string;
  email: string;
  phone?: string;
}

// Attendees response
export interface AttendeesResponse {
  success: boolean;
  message: string;
  data: {
    attendees: IRegistration[];
    total: number;
    currentPage: number;
  };
}