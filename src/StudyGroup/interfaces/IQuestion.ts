// src/interfaces/IQuestion.ts

import { Document, Types } from 'mongoose';

/**
 * Question Interface
 * Individual question for tests
 */
export interface IQuestion extends Document {
  _id: Types.ObjectId; // ✅ FIXED: Changed from string to Types.ObjectId
  test: Types.ObjectId; // Reference to Test
  questionText: string;
  questionType: 'mcq' | 'true-false' | 'short-answer' | 'long-answer';
  
  // For MCQ/True-False
  options?: string[]; // ['Option A', 'Option B', 'Option C', 'Option D']
  correctAnswer?: string | string[]; // Single or multiple correct answers
  
  // For subjective
  maxWords?: number;
  sampleAnswer?: string;
  
  // Question metadata
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  subject?: string;
  topic?: string;
  explanation?: string; // Explanation for correct answer
  
  // Media
  imageUrl?: string;
  
  // Order
  order: number; // Question sequence in test
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}