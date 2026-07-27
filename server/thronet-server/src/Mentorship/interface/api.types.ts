// src/types/men/api.types.ts

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  statusCode: number;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  message: string;
  error: string;
  statusCode: number;
  stack?: string;
}

export interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, any>;
}

export interface UserServiceResponse {
  userId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

export interface CompanyServiceResponse {
  companyId: string;
  name: string;
  domain: string;
  industry: string;
}