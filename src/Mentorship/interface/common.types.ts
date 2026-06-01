export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface ErrorDetails {
  field?: string;
  message: string;
  code?: string;
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface TimeStamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDelete {
  isDeleted: boolean;
  deletedAt?: Date;
}

export type QueryFilter<T> = {
  [P in keyof T]?: T[P] | { $regex: string; $options: string };
};