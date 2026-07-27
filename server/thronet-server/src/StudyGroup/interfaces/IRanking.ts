// src/interfaces/IRanking.ts
import { Document, Types } from "mongoose";

export interface IRanking extends Document {
  _id: Types.ObjectId;
  rankingId: string;           // ADD — UUID
  userId: string;

  // Ranks
  globalRank: number;
  categoryRank: number;
  groupRank: number;
  cityRank: number;

  // Metrics for ranking calculation
  totalStudyHours: number;
  attendancePercentage: number;
  currentStreak: number;
  longestStreak: number;

  // Calculated score (weighted)
  rankScore: number;

  // Filters
  category: "JEE" | "NEET" | "College" | "Working" | "Other";
  city: string;
  groupId?: string;

  // Time tracking
  lastUpdated: Date;
  weeklyHours: number;
  monthlyHours: number;

  // Additional stats
  totalSessions: number;
  avgSessionLength: number;
  consistency: number; // 0-100

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}