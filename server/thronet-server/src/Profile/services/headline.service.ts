/**
 * headline.service.ts
 * Production-Level Headline Service for 1M+ Users
 * 
 * Features:
 * - CRUD operations for headlines
 * - Audience targeting
 * - Scheduled publishing
 * - Analytics tracking
 * - Caching with Redis
 * - Audit logging
 * - Event emission
 * 
 * @module services/headline.service
 * @version 1.0.0
 */

import { v4 as uuidv4 } from 'uuid';
import { User, Headline } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import headlineEmitter from '@/shared/events/emitters/headline.emitter';

const logger = LoggerUtil;

type IHeadline = InstanceType<typeof Headline>;

// ==================== INTERFACES ====================

interface CreateHeadlineData {
    title: string;
    // message: string;
    // audience: 'PUBLIC' | 'PRIVATE';
}

interface UpdateHeadlineData {
    title?: string;
    message?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    status?: 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED';
    // audience?: Partial<CreateHeadlineData['audience']>;
}

interface HeadlineFilters {
    type?: string;
    status?: string;
    priority?: string;
    audienceType?: string;
    userId?: string;
    userRole?: string;
    userLocation?: string;
    createdBy?: string;
}

interface PaginationOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

// ==================== HEADLINE SERVICE CLASS ====================

class HeadlineService {

    // ==================== CREATE HEADLINE ====================

    /**
     * Create a new headline
     */
    static async createHeadline(
        userId: string,
        data: CreateHeadlineData,
        createdBy: string,
        createdByName: string,
        ipAddress: string
    ): Promise<IHeadline> {
        const correlationId = uuidv4();

        try {
            logger.info('Creating headline', {
                title: data.title,
                createdBy,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            // Create headline
            const headline = new Headline({
                title: data.title,
                message: data.title, // ✅ Default: title ko hi message bana do
                audience: {
                    type: 'ALL' // ✅ Default: PUBLIC (ALL)
                },
                metadata: {
                    createdBy,
                    createdByName,
                    version: 1,
                    viewCount: 0,
                    clickCount: 0,
                    dismissCount: 0
                },
                analytics: {
                    impressions: 0,
                    clicks: 0,
                    dismissals: 0,
                    averageViewTime: 0
                }
            });

            await headline.save();

            await User.findOneAndUpdate(
                { userId },
                { $set: { headlineId: headline.headlineId } },
                { new: true }
            );

            // ✅ Invalidate cached user profile so the new headlineId
            // reflects immediately on next getUserProfile() call
            await CacheUtil.del(`user:profile:${userId}`);

            // Clear cache
            await this.invalidateHeadlineCache('all');

            // Emit event
            headlineEmitter.emit('headline:created', {
                headlineId: headline.headlineId,
                createdBy,
                timestamp: new Date()
            });

            // Audit log (non-blocking)
            setImmediate(async () => {
                try {
                    await AuditProducer.connect();
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(),
                        userId: createdBy,
                        action: 'HEADLINE_CREATED',
                        ipAddress,
                        status: 'SUCCESS',
                        severity: 'LOW',
                        timestamp: new Date().toISOString(),
                        metadata: {
                            headlineId: headline.headlineId,
                            title: headline.title,
                            audience: headline.audience,
                            correlationId,
                        },
                    });
                } catch (err: any) {
                    logger.warn('Audit event failed', { error: err.message });
                } finally {
                    await AuditProducer.disconnect();
                }
            });

            logger.info('Headline created successfully', {
                headlineId: headline.headlineId,
                type: headline.type,
                correlationId,
            });

            return headline;

        } catch (error: any) {
            console.log('Headline creation failed', {
                error: error.message,
                stack: error.stack,
                data,
                correlationId,
            });

            logger.error('Headline creation failed', {
                error: error.message,
                stack: error.stack,
                data,
                correlationId,
            });

            throw new Error(error.message || 'Failed to create headline');
        }
    }

    /**
 * Get headline by ID
 */
    static async getHeadlineById(headlineId: string): Promise<IHeadline> {
        const headline = await Headline.findOne({ headlineId, 'flags.isDeleted': false }).lean<IHeadline>().exec();

        if (!headline) {
            throw new Error('Headline not found');
        }

        return headline;
    }

    static async getMultipleHeadlinesByIds(headlineIds: string[]): Promise<any[]> {
        try {
            if (!Array.isArray(headlineIds) || headlineIds.length === 0) return [];
            const uniqueIds = [...new Set(headlineIds)];
            const headlines = await Headline.find({
                headlineId: { $in: uniqueIds },
                'flags.isDeleted': false,
            }).lean();
            logger.debug('Multiple headlines fetched', { requested: uniqueIds.length, found: headlines.length });
            return headlines;
        } catch (error: any) {
            logger.error('Failed to fetch multiple headlines', { error: error.message });
            throw new Error(error.message || 'Failed to fetch headlines');
        }
    }

    /**
     * Get all headlines with filters
     */
    static async getAllHeadlines(filters: {
        type?: string;
        status?: string;
        page?: number;
        limit?: number;
    }): Promise<{ headlines: IHeadline[]; total: number }> {
        const { type, status, page = 1, limit = 20 } = filters;

        const query: any = { 'flags.isDeleted': false };

        if (type) query.type = type;
        if (status) query.status = status;

        const skip = (page - 1) * limit;

        const [headlines, total] = await Promise.all([
            Headline.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean<IHeadline[]>(),
            Headline.countDocuments(query)
        ]);

        return { headlines, total };
    }

    /**
     * Allowed fields that clients may modify on a headline.
     * Protected fields (version, status, flags, metadata, type, headlineId) are computed exclusively by the service.
     */
    static readonly ALLOWED_UPDATE_FIELDS = new Set([
        'title',
        'message',
        'priority',
        'audience',
        'scheduling',
        'styling',
        'actions',
    ]);

    /**
     * Update headline
     */
    static async updateHeadline(
        headlineId: string,
        updates: Partial<IHeadline>,
        updatedBy: string,
        updatedByName: string
    ): Promise<IHeadline> {
        // Enforce strict allowlist: version, status, flags, metadata, type are computed by service and ignored if passed
        const safeUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updates || {})) {
            if (HeadlineService.ALLOWED_UPDATE_FIELDS.has(key)) {
                safeUpdates[key] = value;
            }
        }

        const setFields: Record<string, any> = {
            ...safeUpdates,
            'metadata.lastModifiedBy': updatedBy,
            'metadata.lastModifiedByName': updatedByName,
            updatedAt: new Date(),
        };

        // Service computes status from scheduling dates (clients cannot set status)
        const now = new Date();
        const sched = safeUpdates['scheduling'];
        if (sched) {
            if (sched.publishAt && new Date(sched.publishAt) > now) {
                setFields['status'] = 'SCHEDULED';
            } else if (sched.expiresAt && new Date(sched.expiresAt) < now) {
                setFields['status'] = 'EXPIRED';
            } else if (sched.publishAt && new Date(sched.publishAt) <= now) {
                setFields['status'] = 'ACTIVE';
            }
        }

        const headline = await Headline.findOneAndUpdate(
            { headlineId, 'flags.isDeleted': false },
            {
                $set: setFields,
                $inc: { 'metadata.version': 1 },
            },
            { new: true, runValidators: true }
        ).lean<IHeadline>().exec();

        if (!headline) {
            throw new Error('Headline not found');
        }

        await this.invalidateHeadlineCache(headline.type, headlineId);

        return headline;
    }

    // // ==================== HELPER METHODS ====================

    /**
     * Invalidate headline cache
     */
    private static async invalidateHeadlineCache(type: string, headlineId?: string): Promise<void> {
        try {
            const patterns = [
                `headlines:user:*:${type}`,
                `headlines:user:*:all`,
            ];

            if (headlineId) {
                patterns.push(`headline:${headlineId}`);
            }

            for (const pattern of patterns) {
                await CacheUtil.clearByPattern(pattern);
            }

            logger.debug('Headline cache invalidated', { type, headlineId });

        } catch (error: any) {
            logger.warn('Cache invalidation failed', {
                error: error.message,
                type,
                headlineId,
            });
        }
    }

    /**
     * Expire old headlines (cron job)
     */
    static async expireOldHeadlines(): Promise<number> {
        const correlationId = uuidv4();

        try {
            logger.info('Expiring old headlines', { correlationId });

            const count = await Headline.expireOldHeadlines();
            if (count > 0) {
                await this.invalidateHeadlineCache('*');
            }

            logger.info('Old headlines expired', {
                count,
                correlationId,
            });

            return count;

        } catch (error: any) {
            logger.error('Expire old headlines failed', {
                error: error.message,
                correlationId,
            });

            return 0;
        }
    }
}

// ==================== EXPORT ====================

export default HeadlineService;