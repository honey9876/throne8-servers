/**
 * ====================================
 * TASK REPOSITORY
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Task from '../models/Task.model';
import { ITask } from '../interfaces/ITask';
import { TaskStatus } from '../enums/TaskStatus.enum';
import { TaskPriority } from '../enums/TaskPriority.enum';

export class TaskRepository extends BaseRepository<ITask> {
  constructor() {
    super(Task);
  }

  // ADD: findByTaskId — UUID se fetch
  async findByTaskId(taskId: string): Promise<ITask | null> {
    try {
      return await this.model.findOne({ taskId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding task by taskId: ${error}`);
    }
  }

  // ADD: findRawByTaskId — save() ke liye
  async findRawByTaskId(taskId: string): Promise<ITask | null> {
    try {
      return await this.model.findOne({ taskId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding raw task: ${error}`);
    }
  }

  // ADD: findWithPagination — controller mein getAllTasks ke liye
  async findWithPagination(
    filter: any,
    sort: any,
    skip: number,
    limit: number
  ): Promise<ITask[]> {
    try {
      return await this.model
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec() as unknown as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding tasks with pagination: ${error}`);
    }
  }

  // ADD: count
  async count(filter: any): Promise<number> {
    try {
      return await this.model.countDocuments(filter).exec();
    } catch (error: any) {
      throw new Error(`Error counting tasks: ${error}`);
    }
  }

  // ADD: deleteByTaskId
  async deleteByTaskId(taskId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.model
        .findOneAndDelete({ taskId, userId: userId })
        .exec();
      return !!result;
    } catch (error: any) {
      throw new Error(`Error deleting task: ${error}`);
    }
  }

  // ADD: updateByTaskId
  async updateByTaskId(taskId: string, userId: string, updates: any): Promise<ITask | null> {
    try {
      const task = await this.model.findOne({ taskId, userId: userId }).exec();
      if (!task) return null;
      Object.assign(task, updates);
      await task.save();
      return task.toObject();
    } catch (error: any) {
      throw new Error(`Error updating task: ${error}`);
    }
  }


  /**
   * Find tasks by user
   */
  async findByUser(
    userId: string,
    filters: {
      status?: TaskStatus;
      priority?: TaskPriority;
      completed?: boolean;
      tags?: string[];
    } = {}
  ): Promise<ITask[]> {
    try {
      const query: any = { userId: userId };

      if (filters.status) query.status = filters.status;
      if (filters.priority) query.priority = filters.priority;
      if (filters.completed !== undefined) query.completed = filters.completed;
      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }

      const result = await this.model.find(query).sort({ createdAt: -1 }).exec();
      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding tasks by user: ${error}`);
    }
  }

  /**
   * Find active tasks
   */
  async findActiveTasks(userId: string): Promise<ITask[]> {
    try {
      const result = await this.model
        .find({ userId: userId, completed: false })
        .sort({ priority: -1, deadline: 1 })
        .exec();

      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding active tasks: ${error}`);
    }
  }

  /**
   * Find completed tasks
   */
  async findCompletedTasks(userId: string): Promise<ITask[]> {
    try {
      const result = await this.model
        .find({ userId: userId, completed: true })
        .sort({ completedAt: -1 })
        .exec();

      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding completed tasks: ${error}`);
    }
  }

  /**
   * Find overdue tasks
   */
  async findOverdueTasks(userId: string): Promise<ITask[]> {
    try {
      const result = await this.model
        .find({
          userId: userId,
          deadline: { $lt: new Date() },
          completed: false,
        })
        .sort({ deadline: 1 })
        .exec();

      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding overdue tasks: ${error}`);
    }
  }

  /**
   * Find upcoming tasks
   */
  async findUpcomingTasks(userId: string, days: number = 7): Promise<ITask[]> {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const result = await this.model
        .find({
          userId: userId,
          deadline: { $gte: now, $lte: futureDate },
          completed: false,
        })
        .sort({ deadline: 1 })
        .exec();

      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding upcoming tasks: ${error}`);
    }
  }

  /**
   * Find today's tasks
   */
  async findTodaysTasks(userId: string): Promise<ITask[]> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await this.model
        .find({
          userId: userId,
          deadline: { $gte: today, $lt: tomorrow },
          completed: false,
        })
        .sort({ priority: -1, deadline: 1 })
        .exec();

      return result as ITask[];
    } catch (error: any) {
      throw new Error(`Error finding today's tasks: ${error}`);
    }
  }

  /**
   * Mark task as complete
   */
  async markAsComplete(taskId: string): Promise<ITask | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          taskId,
          {
            completed: true,
            completedAt: new Date(),
            status: TaskStatus.COMPLETED,
          },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error marking task as complete: ${error}`);
    }
  }

  /**
   * Mark task as incomplete
   */
  async markAsIncomplete(taskId: string): Promise<ITask | null> {
    try {
      return await this.model
        .findByIdAndUpdate(
          taskId,
          {
            completed: false,
            completedAt: null,
            status: TaskStatus.PENDING,
          },
          { new: true }
        )
        .exec();
    } catch (error: any) {
      throw new Error(`Error marking task as incomplete: ${error}`);
    }
  }

  /**
   * Get task statistics
   */
  async getTaskStats(userId: string): Promise<any> {
    try {
      const [stats, byPriority] = await Promise.all([
        this.model.aggregate([
          { $match: { userId: userId } },   // was: new mongoose.Types.ObjectId(userId)
          {
            $group: {
              _id: null,
              totalTasks: { $sum: 1 },
              completedTasks: { $sum: { $cond: [{ $eq: ['$completed', true] }, 1, 0] } },
              pendingTasks: { $sum: { $cond: [{ $eq: ['$completed', false] }, 1, 0] } },
              overdueTasks: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$completed', false] }, { $lt: ['$deadline', new Date()] }] },
                    1, 0,
                  ],
                },
              },
            },
          },
        ]),
        this.model.aggregate([
          { $match: { userId: userId } },   // was: new mongoose.Types.ObjectId(userId)
          { $group: { _id: '$priority', count: { $sum: 1 } } },
        ]),
      ]);

      const base = stats[0] || { totalTasks: 0, completedTasks: 0, pendingTasks: 0, overdueTasks: 0 };
      return {
        ...base,
        completionRate: base.totalTasks > 0
          ? Math.round((base.completedTasks / base.totalTasks) * 100)
          : 0,
        byPriority: byPriority.reduce((acc: any, item: any) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      };
    } catch (error: any) {
      throw new Error(`Error getting task stats: ${error}`);
    }
  }

  // UPDATE: markAsComplete — taskId UUID se karo
  async markAsCompleteByTaskId(taskId: string, userId: string): Promise<ITask | null> {
    try {
      return await this.model.findOneAndUpdate(
        { taskId, userId: userId },   // was: findById
        { completed: true, completedAt: new Date(), status: TaskStatus.COMPLETED },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking task complete: ${error}`);
    }
  }

  // UPDATE: markAsIncomplete — taskId UUID se karo
  async markAsIncompleteByTaskId(taskId: string, userId: string): Promise<ITask | null> {
    try {
      return await this.model.findOneAndUpdate(
        { taskId, userId: userId },   // was: findById
        { completed: false, completedAt: null, status: TaskStatus.PENDING },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking task incomplete: ${error}`);
    }
  }

  async deleteByGroupId(groupId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.model
        .findOneAndDelete({ groupId, userId: userId })
        .exec();
      return !!result;
    } catch (error: any) {
      throw new Error(`Error deleting group: ${error}`);
    }
  }

}

export default new TaskRepository();