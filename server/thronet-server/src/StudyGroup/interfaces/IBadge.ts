/**
 * ====================================
 * BADGE INTERFACE
 * ====================================
 */

import { Document, Types } from 'mongoose';
import { Timestamps } from '../types/common.types';

export interface IBadge extends Document, Timestamps {
  _id: Types.ObjectId;
  name: string;
  description: string;
  icon: string; // emoji or URL
  category: 'streak' | 'hours' | 'task' | 'goal' | 'doubt' | 'other';
  requirement: number; // e.g., 7 days, 100 hours
  requirementType: 'days' | 'hours' | 'count';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  points: number; // Reward points
  isActive: boolean;
  order: number; // Display order
}

export interface IUserBadge {
  badge: Types.ObjectId | IBadge;
  earnedAt: Date;
  progress: number; // Current progress towards badge
  isCompleted: boolean;
}