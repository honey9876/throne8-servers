/**
 * ====================================
 * PROGRESS INTERFACE
 * ====================================
 * Interface for user progress tracking
 */

import { Document, Types } from 'mongoose';

export interface IProgress extends Document {
  _id: Types.ObjectId;
  progressId:string;
  user: string;
  
  // Daily progress
  dailyStudyHours: number;
  dailyGoalHours: number;
  dailyProgress: number; // Percentage
  
  // Weekly progress
  weeklyStudyHours: number;
  weeklyGoalHours: number;
  weeklyProgress: number; // Percentage
  
  // Total progress
  totalStudyHours: number;
  totalSessions: number;
  averageSessionDuration: number; // in minutes
  
  // Activity tracking
  lastStudyDate: Date;
  studyDaysCount: number;
  consecutiveStudyDays: number;
  
  // Performance metrics
  completionRate: number; // Goal completion percentage
  consistency: number; // Consistency score (0-100)
  productivity: number; // Productivity score (0-100)
  
  // Timestamps
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

export default IProgress;