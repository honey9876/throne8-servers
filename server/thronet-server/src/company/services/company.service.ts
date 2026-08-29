import {
  CreateCompanyDTO,
  UpdateCompanyDTO,
  CompanyFilterQuery,
  CompanyListResponse,
  ICompanyDocument,
} from '../interfaces';
import { FilterQuery, SortOrder } from 'mongoose';
import crypto from 'crypto';
import { Company } from '../models';
import CacheUtil from '@/shared/cache.util';
import companyRepository from '../repositories/company.repository';

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

  private async invalidateCompanyCache(objectId: string): Promise<void> {
    try {
      await CacheUtil.del(`${this.CACHE_PREFIX}${objectId}`);
    } catch {
      // ignore
    }
  }

  private async invalidateListCache(): Promise<void> {
    // list cache invalidation
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
}

export default new CompanyService();