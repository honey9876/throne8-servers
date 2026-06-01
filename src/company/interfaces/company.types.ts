import { CompanyStatus } from './common.types';

// Database Document
export interface ICompanyDocument {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  foundedYear?: number;
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
  logo?: string;
  banner?: string;
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  stats: {
    followersCount: number;
    postsCount: number;
    employeesCount: number;
  };
  isVerified: boolean;
  status: CompanyStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Create Request DTO
export interface CreateCompanyDTO {
  companyName: string;        
  email?: string;
  phone?: { country?: string; number: string };
  website?: string;
  industry?: string;
  companyType?: string;
  companySize?: string;       
  foundedYear?: number;       
  headquarters?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
  };
  descriptions?: {
    short?: string;
    detailed?: string;
    tagline?: string;
  };
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    youtube?: string;
    github?: string;
  };
  tagline?: string;
  logo?: string;
  banner?: string;
  status?: string;
  createdBy?: string;
}

// Update Request DTO
export interface UpdateCompanyDTO {
  name?: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  foundedYear?: number;
  headquarters?: {
    city?: string;
    state?: string;
    country?: string;
  };
  logo?: string;
  banner?: string;
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  status?: CompanyStatus;
  isVerified?: boolean;
}

// Response DTO
export interface CompanyResponseDTO {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  logo?: string;
  banner?: string;
  isVerified: boolean;
  status: CompanyStatus;
  stats: {
    followersCount: number;
    postsCount: number;
    employeesCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Query Filter DTO
export interface CompanyFilterQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  industry?: string;
  size?: string;
  status?: CompanyStatus;
  isVerified?: boolean;
  sort?: 'name' | 'followers' | 'recent' | 'oldest';
}

// List Response
export interface CompanyListResponse {
  companies: CompanyResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}