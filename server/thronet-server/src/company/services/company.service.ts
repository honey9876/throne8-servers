import {
  CreateCompanyDTO,
  UpdateCompanyDTO,
  CompanyFilterQuery,
  CompanyListResponse,
  ICompanyDocument,
} from '../interfaces';
import mongoose, { FilterQuery, SortOrder } from 'mongoose';
import crypto from 'crypto';
import { Company, CompanyPost, Event } from '../models';
import JobApplication from '../../Job-Service/models/jobApplication.model';
import Job from '../../Job-Service/models/Job.model';
import Conversation from '../../message/models/conversation.model';
import CacheUtil from '@/shared/cache.util';
import companyRepository from '../repositories/company.repository';
import logger from '@/shared/logger.util';

interface CompanySortOptions {
  [key: string]: SortOrder;
}

interface CompanyFilter extends FilterQuery<ICompanyDocument> {
  $text?: { $search: string };
  industry?: string;
  size?: string;
  status?: string;
  isVerified?: boolean;
}

interface CompanyStats {
  followersCount: number;
  postsCount: number;
  employeesCount: number;
  isVerified: boolean;
  status: string;
}

interface SocialLinks {
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
  [key: string]: string | undefined;
}

class CompanyService {
  private readonly CACHE_PREFIX = 'company:';
  private readonly CACHE_TTL = 3600;       // 1 hour
  private readonly LIST_CACHE_TTL = 600;   // 10 minutes
  private readonly MAX_CACHE_KEY_LENGTH = 200;

  // ─────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────

  private generateCacheKey(prefix: string, params: Record<string, unknown>): string {
    const sanitized = Object.entries(params)
      .filter(([_, value]) => value !== undefined && value !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${String(value).substring(0, 100)}`)
      .join('|');

    if (sanitized.length > this.MAX_CACHE_KEY_LENGTH) {
      const hash = crypto.createHash('md5').update(sanitized).digest('hex');
      return `${prefix}${hash}`;
    }

    return `${prefix}${sanitized}`;
  }


  // ─────────────────────────────────────────────
  // CREATE
  // No UUID resolution needed — POST /companies
  // ─────────────────────────────────────────────

  async create(data: any, createdBy?: string): Promise<any> {
    // companySlug pre-save middleware generate karega automatically
    // but safety ke liye backup:
    const slug = data.companyName
      ?.toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || `company-${Date.now()}`;

    const company = new Company({
      ...data,
      companySlug: slug,    // pre-save middleware override karega, but backup ke liye
    });

    await company.save();
    await this.invalidateListCache();
    return company;
  }

  // ─────────────────────────────────────────────
  // GET BY OBJECT ID
  // Called after resolveCompanyUUID resolves UUID → ObjectId
  // ─────────────────────────────────────────────

  async getById(objectId: string): Promise<any | null> {
    const cacheKey = `${this.CACHE_PREFIX}${objectId}`;

    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const company = await companyRepository.findByObjectId(objectId);
    if (company) await CacheUtil.set(cacheKey, company, this.CACHE_TTL);

    return company;
  }

  // ─────────────────────────────────────────────
  // GET BY SLUG
  // Slug route — no UUID resolution needed
  // ─────────────────────────────────────────────

  async getBySlug(slug: string): Promise<ICompanyDocument | null> {
    const cacheKey = `${this.CACHE_PREFIX}slug:${slug}`;

    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const company = await companyRepository.findBySlug(slug);
    if (company) await CacheUtil.set(cacheKey, company, this.CACHE_TTL);

    return company as ICompanyDocument | null;
  }

  // ─────────────────────────────────────────────
  // GET ALL (list with filters)
  // No /:id — no UUID resolution needed
  // ─────────────────────────────────────────────

  async getAll(query: CompanyFilterQuery): Promise<CompanyListResponse> {
    const {
      page = 1,
      pageSize = 10,
      search,
      industry,
      size,
      status,
      isVerified,
      sort = 'recent',
    } = query;

    const cacheKey = this.generateCacheKey(`${this.CACHE_PREFIX}list:`, {
      page, pageSize, search, industry, size, status, isVerified, sort,
    });

    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const filter: CompanyFilter = {};
    if (search) filter.$text = { $search: search };
    if (industry) filter.industry = industry;
    if (size) filter.size = size;
    if (status) filter.status = status;
    if (isVerified !== undefined) filter.isVerified = isVerified;

    let sortOptions: CompanySortOptions = {};
    switch (sort) {
      case 'name': sortOptions = { name: 1 }; break;
      case 'followers': sortOptions = { 'stats.followersCount': -1 }; break;
      case 'oldest': sortOptions = { createdAt: 1 }; break;
      default: sortOptions = { createdAt: -1 };
    }

    const skip = (page - 1) * pageSize;
    const [companies, total] = await companyRepository.findWithFilters(filter, sortOptions, skip, pageSize);

    const totalPages = Math.ceil(total / pageSize);
    const result: CompanyListResponse = {
      companies: companies as unknown as ICompanyDocument[],
      total,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    };

    await CacheUtil.set(cacheKey, result, this.LIST_CACHE_TTL);
    return result;
  }

  // ─────────────────────────────────────────────
  // UPDATE (full)
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async update(objectId: string, data: UpdateCompanyDTO, updatedBy?: string): Promise<ICompanyDocument | null> {
    const company = await companyRepository.updateByObjectId(objectId, { ...data, updatedBy });

    if (company) {
      await this.invalidateCompanyCache(objectId);
      await this.invalidateListCache();
    }

    return company as ICompanyDocument | null;
  }

  // ─────────────────────────────────────────────
  // PARTIAL UPDATE
  // Delegates to update()
  // ─────────────────────────────────────────────

  async partialUpdate(objectId: string, data: Partial<UpdateCompanyDTO>, updatedBy?: string): Promise<ICompanyDocument | null> {
    return this.update(objectId, data as UpdateCompanyDTO, updatedBy);
  }

  // ─────────────────────────────────────────────
  // SOFT DELETE
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async softDelete(objectId: string): Promise<ICompanyDocument | null> {
    const company = await companyRepository.softDeleteByObjectId(objectId);

    if (company) {
      await this.invalidateCompanyCache(objectId);
      await this.invalidateListCache();
    }

    return company as ICompanyDocument | null;
  }

  // ─────────────────────────────────────────────
  // HARD DELETE (internal use only)
  // ─────────────────────────────────────────────

  async delete(objectId: string): Promise<boolean> {
    const result = await Company.findByIdAndDelete(objectId);

    if (result) {
      await this.invalidateCompanyCache(objectId);
      await this.invalidateListCache();
      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────────
  // SEARCH
  // No /:id — no UUID resolution needed
  // ─────────────────────────────────────────────

  async search(searchTerm: string, page: number = 1, pageSize: number = 20): Promise<CompanyListResponse> {
    const skip = (page - 1) * pageSize;
    const [companies, total] = await companyRepository.searchByText(searchTerm, skip, pageSize);
    const totalPages = Math.ceil(total / pageSize);

    return {
      companies: companies as unknown as ICompanyDocument[],
      total,
      page,
      pageSize,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  // ─────────────────────────────────────────────
  // POPULAR
  // No /:id — no UUID resolution needed
  // ─────────────────────────────────────────────

  async getPopular(limit: number = 10): Promise<ICompanyDocument[]> {
    const cacheKey = `${this.CACHE_PREFIX}popular:${limit}`;

    const cached = await CacheUtil.get(cacheKey);
    if (cached) return cached;

    const companies = await companyRepository.findPopular(limit);
    await CacheUtil.set(cacheKey, companies, this.CACHE_TTL);

    return companies as unknown as ICompanyDocument[];
  }

  // ─────────────────────────────────────────────
  // NEARBY
  // No /:id — no UUID resolution needed
  // ─────────────────────────────────────────────

  async getNearby(longitude: number, latitude: number, maxDistance: number = 50000): Promise<ICompanyDocument[]> {
    const companies = await companyRepository.findNearby(longitude, latitude, maxDistance);
    return companies as unknown as ICompanyDocument[];
  }

  // ─────────────────────────────────────────────
  // VERIFY
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async verify(objectId: string): Promise<ICompanyDocument | null> {
    const company = await companyRepository.verifyByObjectId(objectId);
    if (company) await this.invalidateCompanyCache(objectId);
    return company as ICompanyDocument | null;
  }

  // ─────────────────────────────────────────────
  // UPDATE SOCIAL LINKS
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async updateSocialLinks(objectId: string, socialLinks: SocialLinks): Promise<ICompanyDocument | null> {
    const company = await companyRepository.updateSocialLinksByObjectId(objectId, socialLinks);
    if (company) await this.invalidateCompanyCache(objectId);
    return company as ICompanyDocument | null;
  }

  // ─────────────────────────────────────────────
  // GET STATS
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async getStats(objectId: string): Promise<CompanyStats | null> {
    const company = await this.getById(objectId);
    if (!company) return null;

    return {
      followersCount: company.stats?.followersCount || 0,
      postsCount: company.stats?.postsCount || 0,
      employeesCount: company.stats?.employeesCount || 0,
      isVerified: company.isVerified || company.account?.isVerified || false,
      status: company.status || company.account?.status || 'Unknown',
    };
  }

  // ─────────────────────────────────────────────
  // EXISTS CHECK
  // objectId comes from resolveCompanyUUID middleware
  // ─────────────────────────────────────────────

  async exists(objectId: string): Promise<boolean> {
    const count = await companyRepository.countByObjectId(objectId);
    return count > 0;
  }

  // ─────────────────────────────────────────────
  // FOLLOWER HELPERS (internal, called by other services)
  // Accept ObjectId directly
  // ─────────────────────────────────────────────

  async incrementFollowers(objectId: string): Promise<void> {
    await Company.findByIdAndUpdate(objectId, { $inc: { 'stats.followersCount': 1 } });
    await this.invalidateCompanyCache(objectId);
  }

  async decrementFollowers(objectId: string): Promise<void> {
    await Company.findByIdAndUpdate(objectId, { $inc: { 'stats.followersCount': -1 } });
    await this.invalidateCompanyCache(objectId);
  }

  async invalidateCompanyCache(objectId: string): Promise<void> {
    try {
      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
    } catch {
      // ignore
    }
  }

  async invalidateListCache(): Promise<void> {
    try {
      await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}*`);
    } catch {
      // ignore
    }
  }

  // ─────────────────────────────────────────────
  // DASHBOARD: ACTION NEEDED (100% REAL DATA)
  // ─────────────────────────────────────────────

  async getActionNeeded(
    companyIdOrObjectId: string,
    authUserId?: string
  ): Promise<{
    items: Array<{
      id: string;
      label: string;
      action: string;
      href: string;
      urgency: 'high' | 'medium' | 'low';
    }>;
    details: {
      posting: {
        needed: boolean;
        daysSinceLastPost: number | null;
        lastPostDate: string | null;
        label: string;
      };
      applications: {
        needed: boolean;
        pendingCount: number;
        label: string;
      };
      messages: {
        needed: boolean;
        unreadCount: number;
        label: string;
      };
      events: {
        needed: boolean;
        nextEvent: {
          id: string;
          title: string;
          startDate: string;
        } | null;
        daysRemaining: number | null;
        label: string;
      };
      profile: {
        needed: boolean;
        completionPercentage: number;
        missingFields: string[];
        label: string;
      };
    };
  }> {
    let company: any = null;
    if (mongoose.Types.ObjectId.isValid(companyIdOrObjectId)) {
      company = await companyRepository.findByObjectId(companyIdOrObjectId);
    }
    if (!company) {
      company = await companyRepository.findByUUID(companyIdOrObjectId);
    }
    if (!company) {
      company = await companyRepository.findBySlug(companyIdOrObjectId);
    }
    if (!company) {
      throw new Error('Company not found');
    }

    const companyObjId = company._id;
    const companyUUID = company.companyId || String(company._id);
    const idList = Array.from(new Set([String(companyObjId), companyUUID].filter(Boolean)));
    const companyMatchTerms: any[] = [companyObjId, companyUUID];
    if (mongoose.Types.ObjectId.isValid(companyUUID)) {
      companyMatchTerms.push(new mongoose.Types.ObjectId(companyUUID));
    }

    const now = new Date();

    // ── 1. POSTING ACTIVITY ────────────────────────────────────────
    let postingDetails = {
      needed: true,
      daysSinceLastPost: null as number | null,
      lastPostDate: null as string | null,
      label: "You haven't published any posts yet",
    };

    try {
      const latestPost = await CompanyPost.findOne({
        company: { $in: companyMatchTerms },
        isPublished: { $ne: false },
        'audit.isDeleted': { $ne: true },
      })
        .sort({ createdAt: -1 })
        .select('_id postId title createdAt publishedAt')
        .lean();

      if (latestPost) {
        const postDate = new Date(latestPost.publishedAt || latestPost.createdAt);
        const diffMs = Math.max(0, now.getTime() - postDate.getTime());
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        postingDetails = {
          needed: days >= 1,
          daysSinceLastPost: days,
          lastPostDate: postDate.toISOString(),
          label:
            days === 0
              ? 'Last post published today'
              : days === 1
                ? "You haven't posted in 1 day"
                : `You haven't posted in ${days} days`,
        };
      }
    } catch (err: any) {
      logger.warn('Error fetching latest company post for action needed:', err.message);
    }

    // ── 2. JOB APPLICATIONS ────────────────────────────────────────
    let applicationsDetails = {
      needed: false,
      pendingCount: 0,
      label: 'No pending job applications',
    };

    try {
      const companyJobIds = (
        await Job.find({
          $or: [
            { companyId: { $in: idList } },
            ...(authUserId ? [{ createdBy: authUserId }] : []),
          ],
          isDeleted: { $ne: true },
        })
          .select('jobId')
          .lean()
      ).map((j: any) => j.jobId);

      const pendingCount = await JobApplication.countDocuments({
        $or: [
          { companyId: { $in: idList } },
          ...(companyJobIds.length > 0 ? [{ jobId: { $in: companyJobIds } }] : []),
        ],
        status: { $in: ['submitted', 'applied', 'pending'] },
      });

      applicationsDetails = {
        needed: pendingCount > 0,
        pendingCount,
        label:
          pendingCount > 0
            ? `${pendingCount} new job application${pendingCount === 1 ? '' : 's'} waiting`
            : '0 new job applications waiting',
      };
    } catch (err: any) {
      logger.warn('Error fetching job applications for action needed:', err.message);
    }

    // ── 3. UNREAD MESSAGES ─────────────────────────────────────────
    let messagesDetails = {
      needed: false,
      unreadCount: 0,
      label: '0 unread messages',
    };

    if (authUserId) {
      try {
        const conversations = await Conversation.find({
          members: authUserId,
          isActive: { $ne: false },
        })
          .select('unreadCounts')
          .lean();

        const unreadCount = conversations.reduce((acc: number, conv: any) => {
          let count = 0;
          if (conv.unreadCounts) {
            if (conv.unreadCounts instanceof Map) {
              count = conv.unreadCounts.get(authUserId) || 0;
            } else if (typeof conv.unreadCounts === 'object') {
              count = (conv.unreadCounts as any)[authUserId] || 0;
            }
          }
          return acc + (Number(count) || 0);
        }, 0);

        messagesDetails = {
          needed: unreadCount > 0,
          unreadCount,
          label:
            unreadCount > 0
              ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
              : '0 unread messages',
        };
      } catch (err: any) {
        logger.warn('Error fetching unread messages for action needed:', err.message);
      }
    }

    // ── 4. UPCOMING EVENTS ─────────────────────────────────────────
    let eventsDetails = {
      needed: false,
      nextEvent: null as { id: string; title: string; startDate: string } | null,
      daysRemaining: null as number | null,
      label: 'No upcoming events',
    };

    try {
      const nextEvent = await Event.findOne({
        $or: [
          { company: { $in: companyMatchTerms } },
          { companyId: { $in: idList } },
        ],
        startDate: { $gte: now },
        isPublished: { $ne: false },
        status: { $nin: ['Cancelled', 'cancelled', 'Completed', 'completed'] },
      })
        .sort({ startDate: 1 })
        .select('title startDate eventId _id')
        .lean();

      if (nextEvent) {
        const diffTime = new Date(nextEvent.startDate).getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

        let label = '';
        if (daysRemaining === 0) {
          label = `Event "${nextEvent.title}" starts today`;
        } else if (daysRemaining === 1) {
          label = `Event "${nextEvent.title}" starts tomorrow`;
        } else {
          label = `Event "${nextEvent.title}" starts in ${daysRemaining} days`;
        }

        eventsDetails = {
          needed: true,
          nextEvent: {
            id: nextEvent.eventId || String(nextEvent._id),
            title: nextEvent.title,
            startDate: new Date(nextEvent.startDate).toISOString(),
          },
          daysRemaining,
          label,
        };
      }
    } catch (err: any) {
      logger.warn('Error fetching upcoming events for action needed:', err.message);
    }

    // ── 5. PROFILE COMPLETION ──────────────────────────────────────
    const profileChecks = [
      {
        name: 'Company Name',
        passed: Boolean(company.companyName && company.companyName.trim()),
      },
      {
        name: 'Tagline & Description',
        passed: Boolean(
          (company.descriptions?.short && company.descriptions.short.trim()) ||
          (company.descriptions?.tagline && company.descriptions.tagline.trim()) ||
          (company.descriptions?.detailed && company.descriptions.detailed.trim()) ||
          (company.description && company.description.trim()) ||
          (company.tagline && company.tagline.trim())
        ),
      },
      {
        name: 'Industry',
        passed: Boolean(company.industry && String(company.industry).trim()),
      },
      {
        name: 'Company Size',
        passed: Boolean(
          (company.companySize || company.size) &&
          String(company.companySize || company.size).trim()
        ),
      },
      {
        name: 'Headquarters Location',
        passed: Boolean(
          (company.headquarters?.city && company.headquarters.city.trim()) ||
          (company.headquarters?.country && company.headquarters.country.trim()) ||
          (company.headquarters?.address && company.headquarters.address.trim())
        ),
      },
      {
        name: 'Website',
        passed: Boolean(company.website && company.website.trim()),
      },
      {
        name: 'Company Logo',
        passed: Boolean(
          company.media?.logo?.url ||
          company.logo ||
          (typeof company.logo === 'string' && company.logo.trim())
        ),
      },
      {
        name: 'Social Media',
        passed: Boolean(
          company.socialMedia?.linkedin ||
          company.socialMedia?.twitter ||
          company.socialMedia?.website ||
          company.socialMedia?.facebook ||
          company.socialMedia?.instagram
        ),
      },
    ];

    const passedCount = profileChecks.filter((c) => c.passed).length;
    const completionPercentage = Math.round((passedCount / profileChecks.length) * 100);
    const missingFields = profileChecks.filter((c) => !c.passed).map((c) => c.name);

    const profileDetails = {
      needed: completionPercentage < 100,
      completionPercentage,
      missingFields,
      label: `Profile completion: ${completionPercentage}%`,
    };

    // ── ASSEMBLE PENDING ITEMS LIST (WITH HONEST EMPTY/REAL DATA) ──
    const items: Array<{
      id: string;
      label: string;
      action: string;
      href: string;
      urgency: 'high' | 'medium' | 'low';
    }> = [];

    // 1. Posting item: only show if never posted or not posted in 1+ days
    if (postingDetails.needed) {
      items.push({
        id: 'p-posting',
        label: postingDetails.label,
        action: 'Create Post',
        href: '/posts',
        urgency:
          postingDetails.daysSinceLastPost === null ||
            (postingDetails.daysSinceLastPost !== null && postingDetails.daysSinceLastPost >= 3)
            ? 'high'
            : 'medium',
      });
    }

    // 2. Job applications item
    if (applicationsDetails.pendingCount > 0) {
      items.push({
        id: 'p-applications',
        label: applicationsDetails.label,
        action: 'Review',
        href: '/jobs',
        urgency: 'high',
      });
    } else {
      items.push({
        id: 'p-applications',
        label: '0 new job applications waiting',
        action: 'Review',
        href: '/jobs',
        urgency: 'low',
      });
    }

    // 3. Messages item
    items.push({
      id: 'p-messages',
      label: messagesDetails.label,
      action: 'Open Inbox',
      href: '/inbox',
      urgency: messagesDetails.unreadCount > 0 ? 'medium' : 'low',
    });

    // 4. Events item
    if (eventsDetails.nextEvent) {
      items.push({
        id: 'p-events',
        label: eventsDetails.label,
        action: 'Manage',
        href: '/events',
        urgency:
          eventsDetails.daysRemaining !== null && eventsDetails.daysRemaining <= 2
            ? 'high'
            : 'medium',
      });
    } else {
      items.push({
        id: 'p-events',
        label: 'No upcoming events',
        action: 'Manage',
        href: '/events',
        urgency: 'low',
      });
    }

    // 5. Profile completion item
    items.push({
      id: 'p-profile',
      label: profileDetails.label,
      action: profileDetails.completionPercentage === 100 ? 'View' : 'Complete',
      href: '/edit',
      urgency: profileDetails.completionPercentage < 60 ? 'high' : 'low',
    });

    return {
      items,
      details: {
        posting: postingDetails,
        applications: applicationsDetails,
        messages: messagesDetails,
        events: eventsDetails,
        profile: profileDetails,
      },
    };
  }
}

export default new CompanyService();