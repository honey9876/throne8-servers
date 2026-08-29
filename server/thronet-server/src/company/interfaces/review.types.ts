export enum ReviewType {
  CURRENT_EMPLOYEE = 'Current Employee',
  FORMER_EMPLOYEE = 'Former Employee',
  CONTRACTOR = 'Contractor',
}

// Create Request DTO
export interface CreateReviewDTO {
  company: string;
  reviewer: string;
  title: string;
  content: string;
  type: ReviewType;
  rating: {
    overall: number;
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  };
  pros?: string[];
  cons?: string[];
  recommendToOthers?: boolean;
}

// Update Request DTO
export interface UpdateReviewDTO {
  title?: string;
  content?: string;
  rating?: {
    overall?: number;
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  };
  pros?: string[];
  cons?: string[];
  recommendToOthers?: boolean;
}

// Response DTO
export interface ReviewResponseDTO {
  _id: string;
  company: {
    _id: string;
    name: string;
    logo?: string;
  };
  reviewer: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  title: string;
  content: string;
  type: ReviewType;
  rating: {
    overall: number;
    culture?: number;
    workLifeBalance?: number;
    management?: number;
    compensation?: number;
  };
  pros?: string[];
  cons?: string[];
  recommendToOthers?: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  isVerified: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Query Filter DTO
export interface ReviewFilterQuery {
  page?: number;
  pageSize?: number;
  company?: string;
  type?: ReviewType;
  minRating?: number;
  maxRating?: number;
  isVerified?: boolean;
  isPublished?: boolean;
  sort?: 'recent' | 'helpful' | 'rating-high' | 'rating-low';
}

// List Response
export interface ReviewListResponse {
  reviews: ReviewResponseDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  averageRating?: number;
}

// Vote DTO
export interface VoteReviewDTO {
  reviewId: string;
  helpful: boolean;
}