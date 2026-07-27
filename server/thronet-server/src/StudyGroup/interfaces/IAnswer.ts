/**
 * ====================================
 * ANSWER INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';

export interface IAnswer extends Document {
  _id: Types.ObjectId;
  answerId:string;
  doubt: string;
  answeredBy: string;
  content: string;
  images: Array<{
    url: string;
    publicId: string;
    uploadedAt: Date;
  }>;
  links: Array<{
    url: string;
    title?: string;
  }>;
  upvotes: number;
  downvotes: number;
  upvotedBy: string[];
  downvotedBy: string[];
  isBestAnswer: boolean;
  markedBestAt?: Date;
  isEdited: boolean;
  editedAt?: Date;
  editHistory: Array<{
    content: string;
    editedAt: Date;
  }>;
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  upvote(userId: string): Promise<void>;
  downvote(userId: string): Promise<void>;
  removeVote(userId: string): Promise<void>;
  markAsBest(): Promise<void>;
  softDelete(): Promise<void>;
}