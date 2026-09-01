import taskRepository from '../repositories/task.repository';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/shared/errors/app.error';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { CreateTaskDTO, UpdateTaskDTO } from '../types/task.types';
import { logger } from '@/shared/logger.util';
import { generateSecureId } from '@/shared/security';
import ITask from '../interfaces/ITask';

class TaskService {

  /**
   * Create a new task for a user
   */
  async createTask(userId: string, taskData: CreateTaskDTO): Promise<any> {
    const task = await taskRepository.create({
      userId,
      groupId:    taskData.groupId || 'personal',
      ...taskData,
      taskId:     generateSecureId(),
      deadline:   taskData.deadline   ? new Date(taskData.deadline)   : undefined,
      reminderAt: taskData.reminderAt ? new Date(taskData.reminderAt) : undefined,
    } as Partial<ITask>);

    logger.info(`Task created: ${task.taskId} for user ${userId}`);
    return task;
  }

  /**
   * Get all tasks for a user with filters and pagination
   */
  async getAllTasks(userId: string, query: any): Promise<any> {
    const {
      status, priority, completed,
      startDate, endDate,
      tags, search,
      page     = 1,
      limit    = 10,
      sortBy   = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter: any = { userId };

    if (status)   filter.status   = status;
    if (priority) filter.priority = priority;

    if (completed !== undefined) {
      filter.completed = completed === 'true' || completed === true;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate)   filter.createdAt.$lte = new Date(endDate);
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    if (search) {
      filter.$or = [
        { title:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum  = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);
    const skip     = (pageNum - 1) * limitNum;
    const sort     = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [tasks, total] = await Promise.all([
      taskRepository.findWithPagination(filter, sort, skip, limitNum),
      taskRepository.count(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      page:        pageNum,
      limit:       limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      tasks,
    };
  }

  /**
   * Get a single task by taskId
   */
  async getTaskById(taskId: string, userId: string): Promise<any> {
    const task = await taskRepository.findByTaskId(taskId);
    if (!task) throw new NotFoundError('Task not found');
    if (task.userId !== userId) throw new ForbiddenError('Not authorized');
    return task;
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, userId: string, updateData: UpdateTaskDTO): Promise<any> {
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestError('No update data provided');
    }

    const task = await taskRepository.updateByTaskId(taskId, userId, updateData);
    if (!task) throw new NotFoundError('Task not found');

    logger.info(`Task updated: ${taskId}`);
    return task;
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, userId: string): Promise<void> {
    const deleted = await taskRepository.deleteByTaskId(taskId, userId);
    if (!deleted) throw new NotFoundError('Task not found');
    logger.info(`Task deleted: ${taskId}`);
  }

  /**
   * Mark a task as complete
   */
  async markTaskComplete(taskId: string, userId: string): Promise<any> {
    const existing = await taskRepository.findByTaskId(taskId);
    if (!existing) throw new NotFoundError('Task not found');
    if (existing.userId !== userId) throw new ForbiddenError('Not authorized');
    if (existing.completed) throw new BadRequestError('Task is already completed');

    const task = await taskRepository.markAsCompleteByTaskId(taskId, userId);
    logger.info(`Task marked complete: ${taskId}`);
    return task;
  }

  /**
   * Mark a task as incomplete
   */
  async markTaskIncomplete(taskId: string, userId: string): Promise<any> {
    const existing = await taskRepository.findByTaskId(taskId);
    if (!existing) throw new NotFoundError('Task not found');
    if (existing.userId !== userId) throw new ForbiddenError('Not authorized');
    if (!existing.completed) throw new BadRequestError('Task is already incomplete');

    const task = await taskRepository.markAsIncompleteByTaskId(taskId, userId);
    logger.info(`Task marked incomplete: ${taskId}`);
    return task;
  }

  /**
   * Get all overdue tasks for a user
   */
  async getOverdueTasks(userId: string): Promise<any[]> {
    return await taskRepository.findOverdueTasks(userId);
  }

  /**
   * Get tasks due within the next N days (max 30)
   */
  async getUpcomingTasks(userId: string, days: number): Promise<any[]> {
    const safeDays = Math.min(days, 30);
    return await taskRepository.findUpcomingTasks(userId, safeDays);
  }

  /**
   * Get task statistics for a user
   */
  async getTaskStats(userId: string): Promise<any> {
    return await taskRepository.getTaskStats(userId);
  }
}

export default new TaskService();