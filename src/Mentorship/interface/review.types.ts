// src/types/review.types.ts

export interface ReviewData {
  sessionId: string;
  mentorId: string;
  menteeId: string;
  rating: number;
  comment: string;
  categories?: {
    communication?: number;
    knowledge?: number;
    helpfulness?: number;
    professionalism?: number;
  };
  isAnonymous?: boolean;
}

export interface ReviewResponse {
  reviewId: string;
  rating: number;
  comment: string;
  mentorResponse?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  categoryAverages?: {
    communication: number;
    knowledge: number;
    helpfulness: number;
    professionalism: number;
  };
}

export interface ReviewFilter {
  mentorId?: string;
  menteeId?: string;
  rating?: number;
  minRating?: number;
  maxRating?: number;
  startDate?: Date;
  endDate?: Date;
  hasResponse?: boolean;
  isAnonymous?: boolean;
}