// src/types/user.types.ts
export enum UserRole {
  ADMIN = 'admin',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export interface IUser {
  _id: string;
  userId: string; // Added for compatibility
  email: string;
  firstName: string;
  lastName: string;
  name?: string; // Computed property
  role: UserRole;
  status: UserStatus;
  profileImage?: string;
  photo?: string; // Alias for profileImage
  phone?: string;
  phoneNumber?: string; // Alias for phone
  bio?: string;
  location?: string;
  companyId?: string;
  skills?: string[];
  interests?: string[];
  socialLinks?: {
    linkedin?: string;
    github?: string;
    twitter?: string;
    portfolio?: string;
  };
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  user: IUser;
  completionPercentage: number;
  isMentor: boolean;
  isMentee: boolean;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface UserResponse {
  success: boolean;
  data: IUser;
  message?: string;
}