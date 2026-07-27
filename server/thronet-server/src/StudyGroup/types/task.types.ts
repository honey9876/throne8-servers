/**
 * ====================================
 * TASK TYPES
 * ====================================
 * Type definitions for Task operations
 */

import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskPriority } from '../enums/TaskPriority.enum';

/**
 * Create Task DTO
 */
export interface CreateTaskDTO {
  title: string;
  taskId: string;   // ADD — external identifier, optional in DTO since service will generate it
  description?: string;
  priority?: TaskPriority;
  deadline?: Date | string;
  tags?: string[];
  reminderAt?: Date | string;
  groupId?: string;   // ADD
}

/**
 * Update Task DTO
 */
export interface UpdateTaskDTO {
  title?: string;
  taskId: string; 
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: Date | string;
  tags?: string[];
  reminderAt?: Date | string;
}

/**
 * Task Filter Options
 */
export interface TaskFilterOptions {
  status?: TaskStatus;
  priority?: TaskPriority;
  completed?: boolean;
  startDate?: Date | string;
  endDate?: Date | string;
  tags?: string[];
  search?: string;
  taskId: string; 
}

/**
 * Task Query Options
 */
export interface TaskQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Task Response
 */
export interface TaskResponse {
  _id: string;
  taskId: string; 
  groupId?: string;
  user: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: Date;
  completed: boolean;
  completedAt?: Date;
  tags?: string[];
  reminderAt?: Date;
  daysRemaining?: number;
  isOverdue?: boolean;
  createdAt: Date;
  updatedAt: Date;
}