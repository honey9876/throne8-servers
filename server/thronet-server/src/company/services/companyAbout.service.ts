import companyAboutRepository from '../repositories/companyAbout.repository';
import CacheUtil from '@/shared/cache.util';
import logger from '@/shared/logger.util';

class CompanyAboutService {
    private readonly CACHE_TTL = 1800; // 30 minutes
    private readonly PREFIX = 'about:';

    private key(feature: string, companyId: string, extra = '') {
        return `${this.PREFIX}${feature}:${companyId}${extra}`;
    }

    // ============ FEATURE 1: IDENTITY ============
    async upsertIdentity(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.upsertIdentity(companyObjectId, companyUUID, data, userId);
        await CacheUtil.del(this.key('identity', companyObjectId));
        logger.info(`Identity upserted for company: ${companyUUID}`);
        return result;
    }

    async getIdentity(companyObjectId: string) {
        const cacheKey = this.key('identity', companyObjectId);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const result = await companyAboutRepository.getIdentity(companyObjectId);
        if (result) await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async deleteIdentity(companyObjectId: string) {
        const result = await companyAboutRepository.deleteIdentity(companyObjectId);
        await CacheUtil.del(this.key('identity', companyObjectId));
        return result;
    }

    // ============ FEATURE 2: TIMELINE ============
    async createTimeline(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.createTimeline(companyObjectId, companyUUID, data, userId);
        await CacheUtil.clearByPattern(this.key('timeline', companyObjectId, ':*'));
        return result;
    }

    async getTimelines(companyObjectId: string, page: number, pageSize: number) {
        const cacheKey = this.key('timeline', companyObjectId, `:${page}:${pageSize}`);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const { items, total } = await companyAboutRepository.getTimelines(companyObjectId, page, pageSize);
        const result = {
            items, total, page, pageSize,
            totalPages: Math.ceil(total / pageSize),
            hasMore: page < Math.ceil(total / pageSize),
        };
        await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async updateTimeline(timelineId: string, companyObjectId: string, data: any, userId: string) {
        const result = await companyAboutRepository.updateTimeline(timelineId, companyObjectId, data, userId);
        if (!result) throw new Error('Timeline not found');
        await CacheUtil.clearByPattern(this.key('timeline', companyObjectId, ':*'));
        return result;
    }

    async deleteTimeline(timelineId: string, companyObjectId: string) {
        const result = await companyAboutRepository.deleteTimeline(timelineId, companyObjectId);
        if (!result) throw new Error('Timeline not found');
        await CacheUtil.clearByPattern(this.key('timeline', companyObjectId, ':*'));
        return result;
    }

    // ============ FEATURE 3: UPDATES ============
    async createUpdate(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.createUpdate(companyObjectId, companyUUID, data, userId);
        await CacheUtil.clearByPattern(this.key('updates', companyObjectId, ':*'));
        return result;
    }

    async getUpdates(companyObjectId: string, filters: any) {
        const cacheKey = this.key('updates', companyObjectId, `:${JSON.stringify(filters)}`);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const { items, total } = await companyAboutRepository.getUpdates(companyObjectId, filters);
        const result = {
            items, total,
            page: filters.page || 1,
            pageSize: filters.pageSize || 20,
            totalPages: Math.ceil(total / (filters.pageSize || 20)),
            hasMore: (filters.page || 1) < Math.ceil(total / (filters.pageSize || 20)),
        };
        await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async getUpdateById(updateId: string, companyObjectId: string) {
        const result = await companyAboutRepository.getUpdateById(updateId, companyObjectId);
        if (!result) throw new Error('Update not found');
        return result;
    }

    async updateUpdate(updateId: string, companyObjectId: string, data: any, userId: string) {
        const result = await companyAboutRepository.updateUpdate(updateId, companyObjectId, data, userId);
        if (!result) throw new Error('Update not found');
        await CacheUtil.clearByPattern(this.key('updates', companyObjectId, ':*'));
        return result;
    }

    async deleteUpdate(updateId: string, companyObjectId: string) {
        const result = await companyAboutRepository.deleteUpdate(updateId, companyObjectId);
        if (!result) throw new Error('Update not found');
        await CacheUtil.clearByPattern(this.key('updates', companyObjectId, ':*'));
        return result;
    }

    // ============ FEATURE 4: TESTIMONIALS ============
    async createTestimonial(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.createTestimonial(companyObjectId, companyUUID, data, userId);
        await CacheUtil.clearByPattern(this.key('testimonials', companyObjectId, ':*'));
        return result;
    }

    async getTestimonials(companyObjectId: string, filters: any) {
        const cacheKey = this.key('testimonials', companyObjectId, `:${JSON.stringify(filters)}`);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const { items, total } = await companyAboutRepository.getTestimonials(companyObjectId, filters);
        const result = {
            items, total,
            page: filters.page || 1,
            pageSize: filters.pageSize || 20,
            totalPages: Math.ceil(total / (filters.pageSize || 20)),
            hasMore: (filters.page || 1) < Math.ceil(total / (filters.pageSize || 20)),
        };
        await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async updateTestimonial(testimonialId: string, companyObjectId: string, data: any, userId: string) {
        const result = await companyAboutRepository.updateTestimonial(testimonialId, companyObjectId, data, userId);
        if (!result) throw new Error('Testimonial not found');
        await CacheUtil.clearByPattern(this.key('testimonials', companyObjectId, ':*'));
        return result;
    }

    async deleteTestimonial(testimonialId: string, companyObjectId: string) {
        const result = await companyAboutRepository.deleteTestimonial(testimonialId, companyObjectId);
        if (!result) throw new Error('Testimonial not found');
        await CacheUtil.clearByPattern(this.key('testimonials', companyObjectId, ':*'));
        return result;
    }

    // ============ FEATURE 5: PRODUCT ============
    async upsertProduct(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.upsertProduct(companyObjectId, companyUUID, data, userId);
        await CacheUtil.del(this.key('product', companyObjectId));
        return result;
    }

    async getProduct(companyObjectId: string) {
        const cacheKey = this.key('product', companyObjectId);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const result = await companyAboutRepository.getProduct(companyObjectId);
        if (result) await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    async deleteProduct(companyObjectId: string) {
        const result = await companyAboutRepository.deleteProduct(companyObjectId);
        await CacheUtil.del(this.key('product', companyObjectId));
        return result;
    }

    // ============ FEATURE 6: COMPANY LIFE ============
    async upsertLife(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const result = await companyAboutRepository.upsertLife(companyObjectId, companyUUID, data, userId);
        await CacheUtil.del(this.key('life', companyObjectId));
        return result;
    }

    async getLife(companyObjectId: string) {
        const cacheKey = this.key('life', companyObjectId);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;
        const result = await companyAboutRepository.getLife(companyObjectId);
        if (result) await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
        return result;
    }

    // ============ FULL ABOUT PAGE (single call for frontend) ============
    async getFullAbout(companyObjectId: string) {
        const cacheKey = this.key('full', companyObjectId);
        const cached = await CacheUtil.get(cacheKey);
        if (cached) return cached;

        const [identity, timelines, updates, testimonials, product, life] = await Promise.all([
            companyAboutRepository.getIdentity(companyObjectId),
            companyAboutRepository.getTimelines(companyObjectId, 1, 50),
            companyAboutRepository.getUpdates(companyObjectId, { isPublished: true, pageSize: 10 }),
            companyAboutRepository.getTestimonials(companyObjectId, { isPublished: true, pageSize: 20 }),
            companyAboutRepository.getProduct(companyObjectId),
            companyAboutRepository.getLife(companyObjectId),
        ]);

        const result = { identity, timelines: timelines.items, updates: updates.items, testimonials: testimonials.items, product, life };
        await CacheUtil.set(cacheKey, result, 900); // 15 min for full page
        return result;
    }
}

export default new CompanyAboutService();