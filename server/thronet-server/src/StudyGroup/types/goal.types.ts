/**
 * ====================================
 * GOAL TYPES
 * ====================================
 * Type definitions for Goal operations
 */

/**
 * Create Goal DTO
 */
export interface CreateGoalDTO {
  title: string;
  description?: string;
  targetHours: number;
  startDate: Date | string;
  endDate: Date | string;
  category?: string;
  tags?: string[];
}

/**
 * Update Goal DTO
 */
export interface UpdateGoalDTO {
  title?: string;
  description?: string;
  targetHours?: number;
  currentHours?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  category?: string;
  tags?: string[];
}

/**
 * Goal Filter Options
 */
export interface GoalFilterOptions {
  completed?: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
  category?: string;
  tags?: string[];
  search?: string;
}

/**
 * Goal Query Options
 */
export interface GoalQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Goal Response
 */
export interface GoalResponse {
  _id: string;
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
  progressPercentage: number;
  daysRemaining?: number;
  isOverdue?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Update Goal Progress DTO
 */
export interface UpdateGoalProgressDTO {
  hoursToAdd: number;
}