/**
 * ====================================
 * DOUBT INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';

export interface IDoubt extends Document {
  _id: Types.ObjectId;
  doubtId: string;
  title: string;
  description?: string;
  group: string;
  postedBy: string;
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
  bestAnswer?: string;
  answerCount: number;
  viewCount: number;
  upvotes: number;
  upvotedBy: string[];
  taggedMembers: string[];
  priority: number;
  difficulty: string;
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  markAsSolved(answerId: string): Promise<void>;
  incrementViewCount(): Promise<void>;
  incrementAnswerCount(): Promise<void>;
  decrementAnswerCount(): Promise<void>;
  softDelete(): Promise<void>;
}