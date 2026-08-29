/**
 * src/StudyGroup/repositories/message.repository.ts
 * ====================================
 * MESSAGE REPOSITORY - FULLY FIXED
 * ====================================
 */

import { BaseRepository } from './base.repository';
import Message from '../models/Message.model';
import { IMessage } from '../interfaces/IMessage';
import { MessageType } from '../enums/MessageType.enum';
import mongoose from 'mongoose';

export class MessageRepository extends BaseRepository<IMessage> {
  constructor() {
    super(Message);
  }

  async createMessage(data: any): Promise<IMessage> {
    const message = await this.model.create(data);
    // await message.populate('sender', 'fullName username avatar');
    return message;
  }

  /**
   * Find messages by group with pagination
   */
  // UPDATE: findByGroup populate fix
  async findByGroup(groupId: string, page: number = 1, limit: number = 50) {
    try {
      const skip = (page - 1) * limit;
      const [messagesResult, total] = await Promise.all([
        this.model
          .find({ groupId, isDeleted: false })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          // .populate('sender', 'fullName username avatar')  // was: name email avatar
          // .populate('replyTo', 'content sender')
          .exec(),
        this.model.countDocuments({ groupId, isDeleted: false }).exec(),
      ]);
      return { messages: messagesResult as IMessage[], total };
    } catch (error: any) {
      throw new Error(`Error finding messages by group: ${error}`);
    }
  }

  /**
   * Find pinned messages in a group
   */
  async findPinnedMessages(groupId: string): Promise<IMessage[]> {
    try {
      const result = await this.model
        .find({ groupId, isPinned: true, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        // .populate('sender', 'name email avatar')
        .exec();

      return result as IMessage[];
    } catch (error: any) {
      throw new Error(`Error finding pinned messages: ${error}`);
    }
  }

  /**
   * Find messages by sender
   */
  async findBySender(senderId: string, limit: number = 100): Promise<IMessage[]> {
    try {
      const result = await this.model
        .find({ sender: senderId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        // .populate('groupId', 'title')
        .exec();

      return result as IMessage[];
    } catch (error: any) {
      throw new Error(`Error finding messages by sender: ${error}`);
    }
  }

  /**
   * Search messages in a group
   */
  async searchMessages(
    groupId: string,
    query: string,
    page: number = 1,
    limit: number = 20
  ): Promise<IMessage[]> {
    try {
      const skip = (page - 1) * limit;
      const regex = new RegExp(query, 'i');
      const result = await this.model
        .find({ groupId, content: regex, isDeleted: false })
        .sort({ createdAt: -1 })
        .skip(skip)          // ADD
        .limit(limit)        // was hardcoded 50
        // .populate('sender', 'fullName username avatar')  // was: name email avatar
        .exec();
      return result as IMessage[];
    } catch (error: any) {
      throw new Error(`Error searching messages: ${error}`);
    }
  }

  /**
   * Mark message as read by user
   */
  async markAsRead(messageId: string, userId: string): Promise<IMessage | null> {
    try {
      // return await this.model
      //   .findByIdAndUpdate(
      //     messageId,
      //     { $addToSet: { readBy: userId } },
      //     { new: true }
      //   )async findByIdWithPopulate
      //   .exec();
      return await this.model.findOneAndUpdate(
        { messageId },  // ✅
        { $addToSet: { readBy: userId } },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error marking message as read: ${error}`);
    }
  }

  /**
   * Add reaction to message - FIXED
   */
  async addReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<IMessage | null> {
    try {
      const message = await this.model.findOne({ messageId }).exec();
      if (!message) return null;

      const reactionIndex = message.reactions.findIndex(r => r.emoji === emoji);

      if (reactionIndex === -1) {
        // Reaction doesn't exist, create new
        message.reactions.push({
          emoji,
          users: [userId]
        } as any);
      } else {
        // Reaction exists, add user if not already present
        const reaction = message.reactions[reactionIndex];
        if (reaction && !reaction.users.includes(userId as any)) {
          reaction.users.push(userId);
        }
      }

      return await message.save();
    } catch (error: any) {
      throw new Error(`Error adding reaction: ${error}`);
    }
  }

  /**
   * Remove reaction from message - FIXED
   */
  async removeReaction(
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<IMessage | null> {
    try {
      const message = await this.model.findOne({ messageId }).exec();
      if (!message) return null;

      const reactionIndex = message.reactions.findIndex(r => r.emoji === emoji);

      if (reactionIndex !== -1) {
        const reaction = message.reactions[reactionIndex];

        if (reaction) {
          reaction.users = reaction.users.filter(
            (id: any) => id.toString() !== userId
          );

          // Remove reaction if no users left
          if (reaction.users.length === 0) {
            message.reactions.splice(reactionIndex, 1);
          }
        }
      }

      return await message.save();
    } catch (error: any) {
      throw new Error(`Error removing reaction: ${error}`);
    }
  }

  /**
   * Pin/Unpin message
   */
  async togglePin(messageId: string): Promise<IMessage | null> {
    try {
      const message = await this.model.findOne({ messageId }).exec();
      if (!message) return null;

      message.isPinned = !message.isPinned;
      return await message.save();
    } catch (error: any) {
      throw new Error(`Error toggling pin: ${error}`);
    }
  }

  /**
   * Soft delete message
   */
  async softDelete(messageId: string, deletedBy: string): Promise<IMessage | null> {
    try {
      // return await this.model
      //   .findByIdAndUpdate(
      //     messageId,
      //     {
      //       isDeleted: true,
      //       deletedAt: new Date(),
      //       deletedBy,
      //     },
      //     { new: true }
      //   )
      //   .exec();
      return await this.model.findOneAndUpdate(
        { messageId },  // ✅
        { isDeleted: true, deletedAt: new Date(), deletedBy },
        { new: true }
      ).exec();
    } catch (error: any) {
      throw new Error(`Error soft deleting message: ${error}`);
    }
  }

  /**
   * Get group message statistics
   */
  async getGroupMessageStats(groupId: string): Promise<any> {
    try {
      const stats = await this.model.aggregate([
        { $match: { groupId: groupId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            textMessages: {
              $sum: { $cond: [{ $eq: ['$messageType', MessageType.TEXT] }, 1, 0] },
            },
            fileMessages: {
              $sum: { $cond: [{ $eq: ['$messageType', MessageType.FILE] }, 1, 0] },
            },
            imageMessages: {
              $sum: { $cond: [{ $eq: ['$messageType', MessageType.IMAGE] }, 1, 0] },
            },
            pinnedMessages: {
              $sum: { $cond: [{ $eq: ['$isPinned', true] }, 1, 0] },
            },

          },
        },
        {
          $addFields: {
            todayMessages: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', new Date(new Date().setHours(0, 0, 0, 0))] }, 1, 0]
              }
            }
          }
        }
      ]);

      return stats[0] || {};
    } catch (error: any) {
      throw new Error(`Error getting message stats: ${error}`);
    }
  }

  /**
   * Delete all messages in a group (cleanup)
   */
  async deleteGroupMessages(groupId: string): Promise<number> {
    try {
      const result = await this.model.deleteMany({ groupId }).exec();
      return result.deletedCount;
    } catch (error: any) {
      throw new Error(`Error deleting group messages: ${error}`);
    }
  }

  // ADD: findRawById — lean() nahi, save() call hoga
  async findRawById(messageId: string): Promise<IMessage | null> {
    try {
      return await this.model.findOne({ messageId }).exec();
    } catch (error: any) {
      throw new Error(`Error finding message: ${error}`);
    }
  }

  // ADD: findById (lean version)
  async findById(messageId: string): Promise<IMessage | null> {
    try {
      return await this.model.findById(messageId).lean().exec();
    } catch (error: any) {
      throw new Error(`Error finding message by id: ${error}`);
    }
  }

  // ADD: findByIdWithPopulate — getReadStatus ke liye
  async findByIdWithPopulate(messageId: string): Promise<IMessage | null> {
    try {
       return await this.model.findOne({ messageId })
        // .populate('readBy', 'fullName username avatar')
        .lean()
        .exec();
    } catch (error: any) {
      throw new Error(`Error finding message with populate: ${error}`);
    }
  }

  // ADD: findMessages — before/after cursor support ke liye
  async findMessages(query: any, page: number, limit: number): Promise<IMessage[]> {
    try {
      const skip = (page - 1) * limit;
      const result = await this.model
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        // .populate('sender', 'fullName username avatar')
        // .populate({
        //   path: 'replyTo',
        //   select: 'content sender',
        //   populate: { path: 'sender', select: 'fullName username' },
        // })
        .lean()
        .exec();
      return result as unknown as IMessage[];
    } catch (error: any) {
      throw new Error(`Error finding messages: ${error}`);
    }
  }

  // ADD: countMessages
  async countMessages(query: any): Promise<number> {
    try {
      return await this.model.countDocuments(query).exec();
    } catch (error: any) {
      throw new Error(`Error counting messages: ${error}`);
    }
  }

  // ADD: countPinnedMessages
  async countPinnedMessages(groupId: string): Promise<number> {
    try {
      return await this.model.countDocuments({ groupId, isPinned: true }).exec();
    } catch (error: any) {
      throw new Error(`Error counting pinned messages: ${error}`);
    }
  }

  // ADD: markAllAsRead — new method
  async markAllAsRead(groupId: string, userId: string): Promise<number> {
    try {
      const result = await this.model.updateMany(
        { groupId, readBy: { $ne: userId }, isDeleted: false },
        { $addToSet: { readBy: userId } }
      ).exec();
      return result.modifiedCount;
    } catch (error: any) {
      throw new Error(`Error marking all messages as read: ${error}`);
    }
  }

  // ADD: countUnread
  async countUnread(groupId: string, userId: string): Promise<number> {
    try {
      return await this.model.countDocuments({
        groupId,
        readBy: { $ne: userId },
        sender: { $ne: userId },
        isDeleted: false,
      }).exec();
    } catch (error: any) {
      throw new Error(`Error counting unread messages: ${error}`);
    }
  }

  async getDailyGrowth(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.model.aggregate([
      { $match: { isDeleted: false, createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

}

export default new MessageRepository();