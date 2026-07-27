/**
 * ====================================
 * DOUBT TYPES (COMPLETE - FIXED)
 * ====================================
 */

export interface CreateDoubtDTO {
  title: string;
  description?: string;
  group: string;
  category?: string;
  subject?: string;
  tags?: string[];
  images?: Array<{
    url: string;
    publicId: string;
  }>;
  isUrgent?: boolean;
  taggedMembers?: string[];
  difficulty?: string;
}

export interface UpdateDoubtDTO {
  title?: string;
  description?: string;
  category?: string;
  subject?: string;
  tags?: string[];
  isUrgent?: boolean;
  difficulty?: string;
}

export interface DoubtQueryParams {
  groupId?: string;
  category?: string;
  isSolved?: boolean;
  isUrgent?: boolean;
  postedBy?: string;
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
}

export interface DoubtResponse {
  _id: string;
  title: string;
  description?: string;
  group: string;
  postedBy: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  category: string;
  subject?: string;
  tags: string[];
  images: Array<{
    url: string;
    publicId: string;
    uploadedAt: Date;
  }>;
  isUrgent: boolean;
  isSolved: boolean;
  solvedAt?: Date;
  answerCount: number;
  viewCount: number;
  upvotes: number;
  difficulty: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DoubtStats {
  totalDoubts: number;
  solvedDoubts: number;
  unsolvedDoubts: number;
  urgentDoubts: number;
  totalAnswers: number;
  totalViews: number;
  avgAnswersPerDoubt: number;
  avgViewsPerDoubt: number;
}
