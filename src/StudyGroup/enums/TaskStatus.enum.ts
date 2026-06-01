/**
 * ====================================
 * TASK STATUS ENUM
 * ====================================
 * Defines different statuses for tasks
 */

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export default TaskStatus;
