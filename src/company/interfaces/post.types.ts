import { PostStatus, PostType } from './common.types';

// Re-export PostType so it can be imported from this module
export { PostType };

// Create Request DTO
export interface CreatePostDTO {
  title: string;
  content: string;
  company: string;
  author: string;
  type: PostType;
  media?: Array<{
    url: string;
    type: 'Image' | 'Video';
    caption?: string;
  }>;
  documents?: Array<{        // ✅ ADD
    url: string;
    type: 'PDF' | 'DOC' | 'DOCX' | 'TXT';
    name: string;
    size?: number;
    caption?: string;
  }>;
  tags?: string[];
  scheduledFor?: Date | string;
}

// Update Request DTO
export interface UpdatePostDTO {
  title?: string;
  content?: string;
  type?: PostType;
  media?: Array<{
    url: string;
    type: 'Image' | 'Video';
    caption?: string;
  }>;
  tags?: string[];
  status?: PostStatus;
}

// Response DTO
export interface PostResponseDTO {
  _id: string;
  postId: string;
  title: string;
  slug: string;
  content: string;
  company: {
    _id: string;
    name: string;
    logo?: string;
  };
  author: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  type: PostType;
  media?: Array<{
    url: string;
    type: 'Image' | 'Video';
    caption?: string;
  }>;
  documents?: Array<{
    url: string;
    type: 'PDF' | 'DOC' | 'DOCX' | 'TXT';
    name: string;
    size?: number;
    caption?: string;
  }>;
  hasPoll?: boolean;
  pollData?: {
    question: string;
    options: Array<{
      optionId: string;
      text: string;
      votes: number;
    }>;
    duration: number;
    endsAt: Date;
    totalVotes: number;
    isActive: boolean;
  };
  tags?: string[];
  engagementMetrics: {
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    viewsCount: number;
  };
  status: PostStatus;
  isPublished: boolean;
  publishedAt?: Date;
  scheduledFor?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Query Filter DTO
export interface PostFilterQuery {
  page?: number;
  pageSize?: number;
  company?: string;
  author?: string;
  type?: PostType;
  status?: PostStatus;
  search?: string;
  tags?: string[];
  sort?: 'recent' | 'trending' | 'engagement';
}

// List Response - FIXED
export interface PostListResponse {
  items: PostResponseDTO[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasMore: boolean;
  };
} 
