// Create Request DTO



import { Types } from 'mongoose';

export interface IFollowerDocument {
  _id: Types.ObjectId;
  follower: Types.ObjectId;
  following: Types.ObjectId;
  followedAt: Date;
  isActive: boolean;
  notificationPreferences: {
    posts: boolean;
    events: boolean;
    jobs: boolean;
    updates: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowCompanyDTO {
  follower: string;
  following: string;
  notificationPreferences?: {
    posts?: boolean;
    events?: boolean;
    jobs?: boolean;
    updates?: boolean;
  };
}

// Update Preferences DTO
export interface UpdateFollowPreferencesDTO {
  posts?: boolean;
  events?: boolean;
  jobs?: boolean;
  updates?: boolean;
}

// Response DTO
export interface FollowerResponseDTO {
  _id: string;
  follower: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    profileImage?: string;
  };
  following: {
    _id: string;
    name: string;
    logo?: string;
  };
  followedAt: Date;
  isActive: boolean;
  notificationPreferences: {
    posts: boolean;
    events: boolean;
    jobs: boolean;
    updates: boolean;
  };
  createdAt: Date;
}

// Query Filter DTO
export interface FollowerFilterQuery {
  page?: number;
  pageSize?: number;
  follower?: string;
  following?: string;
  isActive?: boolean;
  sort?: 'recent' | 'oldest';
}

// List Response
export interface FollowerListResponse {
  followers: FollowerResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

// Follower Status DTO
export interface FollowerStatusDTO {
  isFollowing: boolean;
  followedAt?: Date;
  notificationPreferences?: {
    posts: boolean;
    events: boolean;
    jobs: boolean;
    updates: boolean;
  };
}

// Company Followers Stats DTO
export interface CompanyFollowersStatsDTO {
  company: string;
  totalFollowers: number;
  followersGainedThisMonth: number;
  followersLostThisMonth: number;
  engagedFollowers: number;
  inactiveFollowers: number;
}

// Following Companies DTO
export interface FollowingCompanyResponseDTO {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  industry?: string;
  description?: string;
  stats: {
    followersCount: number;
    postsCount: number;
    employeesCount: number;
  };
  followedAt: Date;
}

export interface FollowingListResponse {
  companies: FollowingCompanyResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}