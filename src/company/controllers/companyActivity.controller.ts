import { Request, Response } from 'express';
import mongoose from 'mongoose';
import CompanyActivity from '../models/CompanyActivity.model';
import CompanyReview from '../models/CompanyReview.model';
import Follower from '../models/follower.model';
import CompanyPost from '../models/companyPost.model';
import CompanyPostComment from '../models/CompanyPostComment.model';
import CompanyPostLike from '../models/CompanyPostLike.model';
import Event from '../models/event.model';
import JobApplication from '../../Job-Service/models/jobApplication.model';
import logger from '@/shared/logger.util';

function timeAgo(dateInput: Date | string | undefined): string {
  if (!dateInput) return 'Recently';
  const date = new Date(dateInput);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'US';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-orange-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
];

function getRandomColor(idStr: string): string {
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

class CompanyActivityController {
  // Helper method to sync existing DB records into CompanyActivity if not present yet
  private async syncRealDbActivities(idList: string[]): Promise<void> {
    try {
      if (!idList || idList.length === 0) return;
      const primaryCompanyId = idList[0];

      // Cleanup any legacy malformed companyId entries
      await CompanyActivity.deleteMany({ companyId: '[object Object]' });

      const companyObjIds = idList
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      const companyMatchTerms = [...idList, ...companyObjIds];

      // 1. Sync Reviews
      try {
        const reviews = await CompanyReview.find({
          isPublished: true,
          company: { $in: companyMatchTerms }
        }).lean();

        for (const r of reviews) {
          const targetId = `review-${r._id}`;
          const existing = await CompanyActivity.findOne({
            companyId: { $in: [...idList, '[object Object]'] },
            targetId
          });
          if (!existing) {
            const reviewerName = r.isAnonymous ? 'Anonymous Employee' : (r.reviewer || 'Verified Employee');
            const ratingVal = r.rating?.overall || 5;
            await CompanyActivity.create({
              activityId: `act-${r._id}`,
              companyId: primaryCompanyId,
              type: 'review',
              user: reviewerName,
              avatar: r.isAnonymous ? '👤' : getInitials(reviewerName),
              color: 'bg-yellow-500',
              action: `left a ${ratingVal}★ review on your company`,
              read: false,
              targetId,
              reviewData: {
                rating: ratingVal,
                title: r.title || 'Company Review',
                content: r.content || '',
                isAnonymous: Boolean(r.isAnonymous),
                isVerified: Boolean(r.isVerified),
                sentiment: ratingVal >= 4 ? 'positive' : ratingVal === 3 ? 'neutral' : 'negative',
                existingResponse: r.responses?.[0]?.content || undefined,
              },
              createdAt: r.createdAt || new Date(),
            });
          }
        }
      } catch (e: any) {
        logger.warn('Error syncing review activities:', e.message);
      }

      // 2. Sync Followers
      try {
        const followers = await Follower.find({
          isActive: true,
          following: { $in: companyMatchTerms }
        })
          .populate('follower', 'firstName lastName email profilePhotoId userId')
          .lean();

        for (const f of followers) {
          const targetId = `follow-${f._id}`;
          const existing = await CompanyActivity.findOne({
            companyId: { $in: [...idList, '[object Object]'] },
            targetId
          });
          if (!existing) {
            let name = 'New User';
            if (f.follower && typeof f.follower === 'object') {
              const fn = (f.follower as any).firstName || '';
              const ln = (f.follower as any).lastName || '';
              name = `${fn} ${ln}`.trim() || (f.follower as any).email || 'New User';
            }
            await CompanyActivity.create({
              activityId: `act-${f._id}`,
              companyId: primaryCompanyId,
              type: 'follow',
              user: name,
              avatar: getInitials(name),
              color: getRandomColor(String(f._id)),
              action: 'followed your company',
              read: false,
              targetId,
              createdAt: f.followedAt || f.createdAt || new Date(),
            });
          }
        }
      } catch (e: any) {
        logger.warn('Error syncing follower activities:', e.message);
      }

      // 3. Sync Real Post Comments & Likes
      try {
        const posts = await CompanyPost.find({
          company: { $in: companyMatchTerms }
        }).select('_id postId title company engagementMetrics').lean();

        const postTitleMap = new Map<string, string>();
        const postKeys: string[] = [];

        for (const p of posts) {
          const titleStr = p.title ? `"${p.title.slice(0, 30)}${p.title.length > 30 ? '...' : ''}"` : 'your post';
          if (p.postId) {
            postTitleMap.set(p.postId, titleStr);
            postKeys.push(p.postId);
          }
          if (p._id) {
            postTitleMap.set(String(p._id), titleStr);
            postKeys.push(String(p._id));
          }
        }

        if (postKeys.length > 0) {
          // Sync Comments from CompanyPostComment
          const comments = await CompanyPostComment.find({
            $or: [
              { companyId: { $in: companyMatchTerms } },
              { postId: { $in: postKeys } }
            ]
          }).lean();

          for (const c of comments) {
            const targetId = `comment-${c.commentId || c._id}`;
            const existing = await CompanyActivity.findOne({
              companyId: { $in: [...idList, '[object Object]'] },
              targetId
            });
            if (!existing) {
              const pTitle = postTitleMap.get(c.postId) || 'your post';
              await CompanyActivity.create({
                activityId: `act-comment-${c.commentId || c._id}`,
                companyId: primaryCompanyId,
                type: 'comment',
                user: c.userName || 'User',
                avatar: getInitials(c.userName),
                color: 'bg-orange-500',
                action: `commented: "${(c.text || '').slice(0, 35)}${(c.text || '').length > 35 ? '...' : ''}" on ${pTitle}`,
                read: false,
                targetId,
                createdAt: c.createdAt || new Date(),
              });
            }
          }

          // Sync Likes from CompanyPostLike
          const likes = await CompanyPostLike.find({
            postId: { $in: postKeys }
          }).lean();

          for (const l of likes) {
            const targetId = `like-${l.postId}-${l.userId}`;
            const existing = await CompanyActivity.findOne({
              companyId: { $in: [...idList, '[object Object]'] },
              targetId
            });
            if (!existing) {
              const pTitle = postTitleMap.get(l.postId) || 'your post';
              await CompanyActivity.create({
                activityId: `act-like-${l.likeId || l._id}`,
                companyId: primaryCompanyId,
                type: 'like',
                user: 'User',
                avatar: 'LK',
                color: 'bg-blue-500',
                action: `liked ${pTitle}`,
                read: false,
                targetId,
                createdAt: l.createdAt || new Date(),
              });
            }
          }
        }
      } catch (e: any) {
        logger.warn('Error syncing post activities:', e.message);
      }

      // 4. Sync Job Applications
      try {
        const applications = await JobApplication.find({
          companyId: { $in: idList }
        }).lean();

        for (const a of applications) {
          const targetId = `apply-${a.applicationId || a._id}`;
          const existing = await CompanyActivity.findOne({
            companyId: { $in: [...idList, '[object Object]'] },
            targetId
          });
          if (!existing) {
            await CompanyActivity.create({
              activityId: `act-apply-${a.applicationId || a._id}`,
              companyId: primaryCompanyId,
              type: 'apply',
              user: 'Job Applicant',
              avatar: 'AP',
              color: 'bg-green-500',
              action: `applied for a position`,
              read: false,
              targetId,
              createdAt: a.appliedAt || a.createdAt || new Date(),
            });
          }
        }
      } catch (e: any) {
        logger.warn('Error syncing job application activities:', e.message);
      }

      // 5. Sync Events
      try {
        const events = await Event.find({
          $or: [
            { company: { $in: companyMatchTerms } },
            { companyId: { $in: idList } }
          ]
        }).lean();

        for (const e of events) {
          const targetId = `event-${e._id}`;
          const existing = await CompanyActivity.findOne({
            companyId: { $in: [...idList, '[object Object]'] },
            targetId
          });
          if (!existing) {
            await CompanyActivity.create({
              activityId: `act-event-${e._id}`,
              companyId: primaryCompanyId,
              type: 'event',
              user: 'Participant',
              avatar: 'EV',
              color: 'bg-indigo-500',
              action: `registered for "${e.title || 'Company Event'}"`,
              read: false,
              targetId,
              createdAt: e.createdAt || new Date(),
            });
          }
        }
      } catch (e: any) {
        logger.warn('Error syncing event activities:', e.message);
      }
    } catch (err: any) {
      logger.error('Failed to sync DB activities:', err.message);
    }
  }

  // GET /company/companies/:id/activity
  public async getCompanyActivities(req: Request, res: Response): Promise<void> {
    try {
      const resolvedCompanyUUID = (req as any).resolvedCompanyId;
      const resolvedCompanyObjId = (req as any).resolvedObjectId;
      const rawId = req.params.id;

      const idList = Array.from(
        new Set([resolvedCompanyUUID, resolvedCompanyObjId, rawId].filter(Boolean).map(String))
      );

      if (idList.length === 0) {
        res.status(400).json({ status: 'error', message: 'Company ID is required' });
        return;
      }

      const { filter } = req.query;

      // Sync real database records into CompanyActivity collection
      await this.syncRealDbActivities(idList);

      // Build query from CompanyActivity model matching ANY of company's IDs
      const query: any = { companyId: { $in: idList } };
      if (filter && filter !== 'all') {
        if (filter === 'unread') {
          query.read = false;
        } else {
          query.type = filter;
        }
      }

      const activities = await CompanyActivity.find(query).sort({ createdAt: -1 }).lean();

      // Transform to standard ActivityItemData for frontend
      const formatted = activities.map(a => ({
        id: a.activityId || String(a._id),
        type: a.type,
        user: a.user,
        avatar: a.avatar,
        color: a.color,
        action: a.action,
        time: timeAgo(a.createdAt),
        read: Boolean(a.read),
        review: a.reviewData || undefined,
        createdAt: new Date(a.createdAt).getTime(),
      }));

      res.status(200).json({
        status: 'success',
        results: formatted.length,
        data: formatted,
      });
    } catch (error: any) {
      logger.error('Error fetching company activities:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch company activities',
      });
    }
  }

  // PATCH /company/companies/:id/activity/:activityId/read
  public async markActivityRead(req: Request, res: Response): Promise<void> {
    try {
      const { activityId } = req.params;
      const updated = await CompanyActivity.findOneAndUpdate(
        { $or: [{ activityId }, { _id: mongoose.Types.ObjectId.isValid(activityId) ? activityId : null }] },
        { $set: { read: true } },
        { new: true }
      );

      res.status(200).json({
        status: 'success',
        message: 'Activity marked as read',
        data: updated,
      });
    } catch (error: any) {
      logger.error('Error marking activity as read:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  // POST /company/companies/:id/activity/read-all
  public async markAllActivitiesRead(req: Request, res: Response): Promise<void> {
    try {
      const resolvedCompanyUUID = (req as any).resolvedCompanyId;
      const resolvedCompanyObjId = (req as any).resolvedObjectId;
      const rawId = req.params.id;

      const idList = Array.from(
        new Set([resolvedCompanyUUID, resolvedCompanyObjId, rawId].filter(Boolean).map(String))
      );

      await CompanyActivity.updateMany({ companyId: { $in: idList }, read: false }, { $set: { read: true } });

      res.status(200).json({
        status: 'success',
        message: 'All activities marked as read',
      });
    } catch (error: any) {
      logger.error('Error marking all activities as read:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
}

export const companyActivityController = new CompanyActivityController();
export default companyActivityController;
