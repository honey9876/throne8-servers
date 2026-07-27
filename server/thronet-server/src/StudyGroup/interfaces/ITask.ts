/**
 * ====================================
 * TASK INTERFACE
 * ====================================
 * TypeScript interface for Task
 */

import { Document, Types } from 'mongoose';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskPriority } from '../enums/TaskPriority.enum';

export interface ITask extends Document {
  _id: Types.ObjectId;
  userId: string;
  taskId: string;
  groupId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: Date;
  completed: boolean;
  completedAt?: Date;
  tags?: string[];
  reminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export default ITask;