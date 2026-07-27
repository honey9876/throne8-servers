import { AdminRole } from './common.types';

export enum AdminPermission {
  MANAGE_COMPANIES = 'manage_companies',
  MANAGE_USERS = 'manage_users',
  MANAGE_POSTS = 'manage_posts',
  MANAGE_REVIEWS = 'manage_reviews',
  MANAGE_ADMINS = 'manage_admins',
  VIEW_ANALYTICS = 'view_analytics',
}

// Create Request DTO
export interface CreateAdminDTO {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: AdminRole;
  permissions?: AdminPermission[];
}

// Update Request DTO
export interface UpdateAdminDTO {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: AdminRole;
  permissions?: AdminPermission[];
  isActive?: boolean;
}

// Response DTO
export interface AdminResponseDTO {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: AdminRole;
  permissions: AdminPermission[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Login Request DTO
export interface LoginAdminDTO {
  email: string;
  password: string;
}

// Login Response DTO
export interface LoginResponseDTO {
  admin: AdminResponseDTO;
  token: string;
  expiresIn: string;
}

// Query Filter DTO
export interface AdminFilterQuery {
  page?: number;
  pageSize?: number;
  role?: AdminRole;
  isActive?: boolean;
  search?: string;
  sort?: 'recent' | 'name' | 'lastLogin';
}

// List Response
export interface AdminListResponse {
  admins: AdminResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// Audit Log DTO
export interface AuditLogDTO {
  _id?: string;
  admin: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: Date;
}

// Permission Check DTO
export interface PermissionCheckDTO {
  adminId: string;
  permission: AdminPermission;
}

export interface PermissionCheckResponseDTO {
  hasPermission: boolean;
  role: AdminRole;
  permissions: AdminPermission[];
}

// Change Password DTO
export interface ChangePasswordDTO {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}