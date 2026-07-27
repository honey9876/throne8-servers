/**
 * ====================================
 * GOAL INTERFACE
 * ====================================
 * TypeScript interface for Goal
 */

import { Document, Types } from 'mongoose';

export interface IGoal extends Document {
  _id: Types.ObjectId;
  goalId: string;
  user: string;
  title: string;
  description?: string;
  targetHours: number;
  currentHours: number;
  startDate: Date;
  endDate: Date;
  completed: boolean;
  completedAt?: Date;
  category?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export default IGoal;