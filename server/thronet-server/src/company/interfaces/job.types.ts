// =====================================================
// src/types/job.types.ts - PRODUCTION READY
// =====================================================

import { JobStatus, ApplicationStatus } from './common.types';

export enum JobType {
  FULL_TIME = 'Full-time',
  PART_TIME = 'Part-time',
  CONTRACT = 'Contract',
  INTERNSHIP = 'Internship',
}

export enum ExperienceLevel {
  ENTRY = 'Entry',
  MID = 'Mid',
  SENIOR = 'Senior',
  LEAD = 'Lead',
  EXECUTIVE = 'Executive',
}

// =====================================================
// SORT OPTIONS (Strongly Typed)
// =====================================================
export type JobSortOption = 'recent' | 'popular' | 'closing-soon' | 'salary-high' | 'salary-low';

export type JobLocationType = 'Remote' | 'On-site' | 'Hybrid';

// =====================================================
// CREATE JOB DTO
// =====================================================
export interface CreateJobDTO {
  title: string;
  description: string;
  company: string;
  department?: string;
  type: JobType;
  experienceLevel: ExperienceLevel;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  location: JobLocationType;
  responsibilities?: string[];
  requirements?: string[];
  skills?: string[];
  benefits?: string[];
  closingDate?: Date;
}

// =====================================================
// UPDATE JOB DTO
// =====================================================
export interface UpdateJobDTO {
  title?: string;
  description?: string;
  type?: JobType;
  experienceLevel?: ExperienceLevel;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  location?: JobLocationType;
  responsibilities?: string[];
  requirements?: string[];
  skills?: string[];
  benefits?: string[];
  status?: JobStatus;
  closingDate?: Date;
}

// =====================================================
// JOB FILTER QUERY (FIXED - Added skip & limit)
// =====================================================
export interface JobFilterQuery {

  requestId: string;
  // Pagination
  page?: number;
  pageSize?: number;
  skip?: number;       // ✅ FIXED: Added for DB-level pagination
  limit?: number;      // ✅ FIXED: Added for DB-level pagination
  
  // Filters
  company?: string;
  type?: JobType;
  experienceLevel?: ExperienceLevel;
  location?: string;
  skills?: string[];
  search?: string;
  status?: JobStatus;
  
  // Sorting
  sort?: JobSortOption;
  
  // Salary range filters (bonus for production)
  minSalary?: number;
  maxSalary?: number;
}

// =====================================================
// JOB RESPONSE DTO
// =====================================================
export interface JobResponseDTO {
  _id: string;
  title: string;
  slug: string;
  description: string;
  company: {
    _id: string;
    name: string;
    logo?: string;
  };
  department?: string;
  type: JobType;
  experienceLevel: ExperienceLevel;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  location: JobLocationType;
  skills?: string[];
  benefits?: string[];
  applicationsCount: number;
  status: JobStatus;
  postedDate: Date;
  closingDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// JOB LIST RESPONSE (With Metadata)
// =====================================================
export interface JobListResponse {
  jobs: JobResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// =====================================================
// APPLICATION DTO
// =====================================================
export interface ApplyJobDTO {
  jobId: string;
  employeeId: string;
  resume: string;
  coverLetter?: string;
}

export interface JobApplicationResponseDTO {
  _id: string;
  jobId: string;
  employeeId: string;
  resume: string;
  coverLetter?: string;
  status: ApplicationStatus;
  appliedAt: Date;
}

// =====================================================
// BULK OPERATIONS (For Admin/Recruiter)
// =====================================================
export interface BulkJobUpdateDTO {
  jobIds: string[];
  status?: JobStatus;
  closingDate?: Date;
}

export interface BulkApplicationUpdateDTO {
  applicationIds: string[];
  status: ApplicationStatus;
}

// =====================================================
// ANALYTICS DTOs (Bonus for production)
// =====================================================
export interface JobAnalyticsDTO {
  jobId: string;
  views: number;
  applications: number;
  conversionRate: number;
  avgTimeToApply: number;
}