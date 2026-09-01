/**
 * ====================================
 * STREAK INTERFACE
 * ====================================
 * TypeScript interface for Streak model
 */

import { Document, Types } from 'mongoose';

export interface IMilestone {
  days: number;
  achievedAt: Date;
}

export interface IStreak extends Document {
   _id: Types.ObjectId;
  streakId: string;              // ADD — UUID
  user: string;  
  
  // Current streak
  currentStreak: number;
  currentStreakStartDate: Date | null;
  lastActivityDate: Date | null;
  
  // Longest streak
  longestStreak: number;
  longestStreakStartDate: Date | null;
  longestStreakEndDate: Date | null;
  
  // Streak status
  isActive: boolean;
  streakFrozen: boolean;
  freezeReason?: string;
  
  // Milestone tracking
  milestones: IMilestone[];
  
  // Recovery tracking
  streakBreaks: number;
  lastBreakDate: Date | null;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  
  // Virtuals
  daysSinceLastActivity: number | null;
  isCurrentLongest: boolean;
  nextMilestone: number | null;
  daysUntilNextMilestone: number | null;
}