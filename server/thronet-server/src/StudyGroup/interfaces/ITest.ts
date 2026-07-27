// src/interfaces/ITest.ts

import { Document, Types } from 'mongoose';
import { IQuestion } from './IQuestion';

/**
 * Test Interface
 */
export interface ITest extends Document {
  _id: Types.ObjectId; // ✅ FIXED
  testId:string;
  
  // Basic Info
  title: string;
  description?: string;
  group: string; // Reference to Group
  creator: string; // Reference to User
  
  // Test Configuration
  totalMarks: number;
  passingMarks: number;
  duration: number; // Duration in minutes
  
  // Scheduling
  scheduledStartTime?: Date;
  scheduledEndTime?: Date;
  
  // Test Type
  testType: 'practice' | 'mock' | 'assignment';
  
  // Questions
  questions: string[] | IQuestion[]; // References to Question
  totalQuestions: number;
  
  // Settings
  settings: {
    shuffleQuestions: boolean;
    showAnswersAfterSubmit: boolean;
    allowReAttempt: boolean;
    maxAttempts: number;
    negativeMarking: boolean;
    negativeMarksPerQuestion?: number;
  };
  
  // Subject/Topic
  subject?: string;
  topics?: string[];
  
  // Status
  isActive: boolean;
  isPublished: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}