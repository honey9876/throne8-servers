// ============================================
// FILE: types/index.ts (COMPLETE FIX)
// ============================================


export * from './common.types';

// Export other entity types
export * from './company.types';
export * from './post.types';
export * from './employee.types';
export * from './review.types';
export * from './analytics.types';
export * from './follower.types';
export * from './admin.types';
// export type {ApiResponse, PaginatedResponse, ErrorResponse, UserServiceResponse, CompanyServiceResponse} from './api.types';
export {}

export type {
  JobType,
  ExperienceLevel,
  JobSortOption,
  JobLocationType,
  CreateJobDTO,
  UpdateJobDTO,
  JobFilterQuery,
  JobResponseDTO,
  JobListResponse,
  ApplyJobDTO,
  JobApplicationResponseDTO,
  BulkJobUpdateDTO,
  BulkApplicationUpdateDTO,
  JobAnalyticsDTO,
} from './job.types';

export type {
  CreateEventDTO,
  UpdateEventDTO,
  EventFilterQuery,
  EventResponse,
  EventListResponse,
  EventStatsResponse,
  RegisterEventDTO,
  AttendeesResponse,
  ISpeaker,
  ILocation,
  IRegistration,
} from './event.types';


export * from './queue.types';