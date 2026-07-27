import { Document } from 'mongoose';

// =====================================================
// 🆕 EMPLOYEE DOCUMENT INTERFACE (MONGOOSE)
// =====================================================
export interface IEmployeeDocument extends Document {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: {
    _id: string;
    toString(): string;
  };
  designation: string;
  department?: string;
  profileImage?: string;
  bio?: string;
  phone?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  joinDate: Date;
  endDate?: Date;
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  isActive: boolean;
  advocacyScore: number;
  isAdvocate: boolean;
  assignedAsAdvocateAt?: Date;
  assignedAsAdvocateBy?: string;
  postsCount: number;
  followersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// CREATE REQUEST DTO
// =====================================================
export interface CreateEmployeeDTO {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  designation: string;
  department?: string;
  profileImage?: string;
  bio?: string;
  phone?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  joinDate: Date;
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  isAdvocate: boolean;
  assignedAsAdvocateAt?: Date;
}

// =====================================================
// UPDATE REQUEST DTO
// =====================================================
export interface UpdateEmployeeDTO {
  firstName?: string;
  lastName?: string;
  designation?: string;
  department?: string;
  profileImage?: string;
  bio?: string;
  phone?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  endDate?: Date;
  isActive?: boolean;
}

// =====================================================
// RESPONSE DTO
// =====================================================
export interface EmployeeResponseDTO {
  [x: string]: any;
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: {
    _id: string;
    name: string;
    logo?: string;
  };
  designation: string;
  department?: string;
  profileImage?: string;
  bio?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  advocacyScore: number;
  postsCount: number;
  followersCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// QUERY FILTER DTO
// =====================================================
export interface EmployeeFilterQuery {
  page?: number;
  pageSize?: number;
  company?: string;
  department?: string;
  designation?: string;
  search?: string;
  isActive?: boolean;
  sort?: 'advocacy' | 'recent' | 'name';
}

// =====================================================
// LIST RESPONSE
// =====================================================
export interface EmployeeListResponse {
  employees: EmployeeResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}