import forumRepository from "../repositories/forum.repository";
import { CreateForumDTO, CreateForumReplyDTO, ForumListQuery } from "../interface/forum.types";
import { AppError } from "../../shared/errors/app.error";
import notificationService, { NotificationType, NotificationChannel } from "./notification.service";
import { User } from "@/auth/models";
import { logger } from "@/shared/logger.util";
import { ReportReason } from "../models/CommunityReport";


export class ForumService {
  async createForum(userId: string, data: CreateForumDTO) {
    return forumRepository.create(userId, data);
  }

  async getForum(id: string) {
    const forum = await forumRepository.findById(id);
    if (!forum) throw new AppError("Forum thread not found", 404);
    return forum;
  }

  async listForums(query: ForumListQuery) {
    return forumRepository.list(query);
  }

  async addReply(forumId: string, userId: string, data: CreateForumReplyDTO) {
    const forum = await forumRepository.findById(forumId);
    if (!forum) throw new AppError("Forum thread not found", 404);
    if (forum.isLocked) throw new AppError("This thread is locked", 403);
    const reply = await forumRepository.addReply(forumId, userId, data);

    // Notifications (catch and log, don't throw)
    this.sendReplyNotifications(forum, userId, data).catch((err) =>
      logger.error("Failed to send forum reply notifications:", err)
    );

    return reply;
  }

  private async sendReplyNotifications(forum: any, replierId: string, data: CreateForumReplyDTO): Promise<void> {
    try {
      const threadAuthorId =
        typeof forum.author === "object" && forum.author !== null
          ? (forum.author as any).userId || String(forum.author)
          : String(forum.author);

      let replierName = "Someone";
      try {
        const replierUser = await User.findByUserId(replierId);
        if (replierUser) {
          replierName = `${(replierUser as any).firstName ?? ""} ${(replierUser as any).lastName ?? ""}`.trim() || "Someone";
        }
      } catch (userErr: any) {
        logger.warn("Could not fetch replier user details for notification:", userErr?.message);
      }

      const threadTopic = forum.topic || "Forum Thread";
      const forumId = String(forum._id || forum.id);
      const notifiedUserIds = new Set<string>();

      // 1. Send FORUM_REPLY to parent reply's author (if this is a nested reply)
      if (data.parentReplyId) {
        try {
          const parentReply = await forumRepository.findReplyById(data.parentReplyId);
          const parentAuthorId = parentReply?.author
            ? (typeof parentReply.author === "object" && parentReply.author !== null
                ? (parentReply.author as any).userId || String(parentReply.author)
                : String(parentReply.author))
            : null;

          if (parentAuthorId && parentAuthorId !== replierId && !notifiedUserIds.has(parentAuthorId)) {
            await notificationService.sendNotification({
              userId: parentAuthorId,
        module: 'industry-mentor',
              type: NotificationType.FORUM_REPLY,
              channels: [NotificationChannel.IN_APP],
              priority: "normal",
              data: {
                title: "New Reply to Your Comment",
                message: `${replierName} replied to your comment in: "${threadTopic}"`,
                threadId: forumId,
                threadTopic,
                replierId,
                replierName,
                parentReplyId: data.parentReplyId,
                isReplyToComment: true,
              },
            });
            notifiedUserIds.add(parentAuthorId);
          }
        } catch (parentErr: any) {
          logger.error("Failed to send FORUM_REPLY notification to parent reply author:", parentErr);
        }
      }

      // 2. Send FORUM_REPLY to thread author (skip if replier IS thread author, or already notified above)
      if (threadAuthorId && threadAuthorId !== replierId && !notifiedUserIds.has(threadAuthorId)) {
        try {
          await notificationService.sendNotification({
            userId: threadAuthorId,
        module: 'industry-mentor',
            type: NotificationType.FORUM_REPLY,
            channels: [NotificationChannel.IN_APP],
            priority: "normal",
            data: {
              title: "New Reply to Your Thread",
              message: `${replierName} replied to your thread: "${threadTopic}"`,
              threadId: forumId,
              threadTopic,
              replierId,
              replierName,
            },
          });
          notifiedUserIds.add(threadAuthorId);
        } catch (notifErr: any) {
          logger.error("Failed to send FORUM_REPLY notification to thread author:", notifErr);
        }
      }

      // 3. Send FORUM_MENTION to each mentioned user
      // (skip self-mentions, and skip users already notified above)
      const rawMentions = Array.isArray(data.mentions) ? data.mentions : [];
      const uniqueMentions = Array.from(new Set(rawMentions.map((m) => String(m).trim()))).filter(Boolean);

      for (const mentionedUserId of uniqueMentions) {
        if (mentionedUserId === replierId) continue;
        if (notifiedUserIds.has(mentionedUserId)) continue;

        try {
          await notificationService.sendNotification({
            userId: mentionedUserId,
        module: 'industry-mentor',
            type: NotificationType.FORUM_MENTION,
            channels: [NotificationChannel.IN_APP],
            priority: "normal",
            data: {
              title: "Mentioned in Forum Thread",
              message: `${replierName} mentioned you in a reply to: "${threadTopic}"`,
              threadId: forumId,
              threadTopic,
              replierId,
              replierName,
            },
          });
          notifiedUserIds.add(mentionedUserId);
        } catch (mentionErr: any) {
          logger.error(`Failed to send FORUM_MENTION notification to ${mentionedUserId}:`, mentionErr);
        }
      }
    } catch (err: any) {
      logger.error("Error in sendReplyNotifications:", err);
    }
  }

  async listReplies(forumId: string, page?: number, limit?: number) {
    return forumRepository.listReplies(forumId, page, limit);
  }

  async toggleUpvote(forumId: string, userId: string) {
    const forum = await forumRepository.toggleUpvote(forumId, userId);
    if (!forum) throw new AppError("Forum thread not found", 404);
    return forum;
  }

  async deleteForum(id: string, requesterId: string, isAdmin: boolean) {
    const forum = await forumRepository.findById(id);
    if (!forum) throw new AppError("Forum thread not found", 404);
    const authorId = typeof forum.author === 'object' && forum.author !== null
      ? (forum.author as any).userId || String(forum.author)
      : String(forum.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to delete this thread", 403);
    }
    return forumRepository.delete(id);
  }

  async updateForum(id: string, requesterId: string, isAdmin: boolean, data: { topic?: string; description?: string }) {
    const forum = await forumRepository.findById(id);
    if (!forum) throw new AppError("Forum thread not found", 404);
    const authorId = typeof forum.author === 'object' && forum.author !== null
      ? (forum.author as any).userId || String(forum.author)
      : String(forum.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to edit this thread", 403);
    }
    return forumRepository.update(id, data);
  }

  async pinForum(id: string, requesterId: string, isAdmin: boolean, isPinned: boolean) {
    const forum = await forumRepository.findById(id);
    if (!forum) throw new AppError("Forum thread not found", 404);
    const authorId = typeof forum.author === 'object' && forum.author !== null
      ? (forum.author as any).userId || String(forum.author)
      : String(forum.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to pin this thread", 403);
    }
    return forumRepository.pin(id, isPinned);
  }

  async lockForum(id: string, requesterId: string, isAdmin: boolean, isLocked: boolean) {
    const forum = await forumRepository.findById(id);
    if (!forum) throw new AppError("Forum thread not found", 404);
    const authorId = typeof forum.author === 'object' && forum.author !== null
      ? (forum.author as any).userId || String(forum.author)
      : String(forum.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to lock this thread", 403);
    }
    return forumRepository.lock(id, isLocked);
  }

  async updateReply(replyId: string, requesterId: string, isAdmin: boolean, content: string) {
    const reply = await forumRepository.findReplyById(replyId);
    if (!reply) throw new AppError("Reply not found", 404);
    const authorId = typeof reply.author === 'object' && reply.author !== null
      ? (reply.author as any).userId || String(reply.author)
      : String(reply.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to edit this reply", 403);
    }
    return forumRepository.updateReply(replyId, content);
  }

  async deleteReply(replyId: string, requesterId: string, isAdmin: boolean) {
    const reply = await forumRepository.findReplyById(replyId);
    if (!reply) throw new AppError("Reply not found", 404);
    const authorId = typeof reply.author === 'object' && reply.author !== null
      ? (reply.author as any).userId || String(reply.author)
      : String(reply.author);
    if (!isAdmin && authorId !== requesterId) {
      throw new AppError("Not authorized to delete this reply", 403);
    }
    return forumRepository.deleteReply(replyId);
  }

  async reportForum(
    forumId: string,
    reporterId: string,
    reason: ReportReason,
    note?: string
  ) {
    const forum = await forumRepository.findById(forumId);
    if (!forum) throw new AppError("Forum thread not found", 404);

    const existing = await forumRepository.findReport(reporterId, "forum", forumId);
    if (existing) {
      throw new AppError("You have already reported this forum thread", 409);
    }

    try {
      return await forumRepository.createReport({
        reporterId,
        targetType: "forum",
        targetId: forumId,
        forumId,
        reason,
        note,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError("You have already reported this forum thread", 409);
      }
      throw err;
    }
  }

  async reportReply(
    forumId: string,
    replyId: string,
    reporterId: string,
    reason: ReportReason,
    note?: string
  ) {
    const reply = await forumRepository.findReplyById(replyId);
    if (!reply) throw new AppError("Reply not found", 404);

    const existing = await forumRepository.findReport(reporterId, "forumReply", replyId);
    if (existing) {
      throw new AppError("You have already reported this reply", 409);
    }

    try {
      return await forumRepository.createReport({
        reporterId,
        targetType: "forumReply",
        targetId: replyId,
        forumId,
        reason,
        note,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new AppError("You have already reported this reply", 409);
      }
      throw err;
    }
  }

  async listReports(query: {
    status?: "pending" | "resolved" | "dismissed";
    targetType?: "forum" | "forumReply";
    page?: number;
    limit?: number;
  }) {
    return forumRepository.listReports(query);
  }

  async updateReportStatus(reportId: string, status: "resolved" | "dismissed") {
    const updated = await forumRepository.updateReportStatus(reportId, status);
    if (!updated) {
      throw new AppError("Report not found", 404);
    }
    return updated;
  }
}

export default new ForumService();
