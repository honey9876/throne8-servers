// import { Company } from '@/company/models';
import SearchHelper, { SearchFilters, SearchSortOptions } from '@/Mentorship/utils/searchHelper';
import { MentorWithRelations } from '@/Mentorship/interface/mentor.types';
import { Domain, getDomainLabel } from '@/shared/constants/domains';
import { logger } from '@/shared/logger.util';
import PaginationHelper from '@/Mentorship/utils/pagination';
import { Mentor } from '../models';
import { User } from '@/shared/models/index.models';
import { ICompany } from '@/Mentorship/interface/company.types';
import mentorRepository from '../repositories/mentor.repository';
import Company from '@/company/models/Company.model';

export interface SearchMentorsParams {
  filters: SearchFilters;
  sort?: SearchSortOptions;
  page?: number;
  limit?: number;
  authToken?: string;
}

export interface SearchMentorsResult {
  mentors: MentorWithRelations[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  filters: SearchFilters;
}

export interface DomainWithCount {
  domain: Domain;
  label: string;
  mentorCount: number;
  averagePrice: number;
  topMentors: string[]; // Mentor IDs
}

export interface CompanyWithCount {
  companyId: string;
  companyName: string;
  companyLogo?: string;
  mentorCount: number;
  averageRating: number;
}

class SearchService {
  /**
   * Search mentors with filters and pagination
   */
  async searchMentors(params: SearchMentorsParams): Promise<SearchMentorsResult> {
    try {
      const { filters, sort, page = 1, limit = 10, authToken } = params;

      logger.info('Searching mentors with filters:', filters);
      logger.info("sorts", sort)

      // Validate filters
      const validation = SearchHelper.validateFilters(filters);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // Validate pagination
      const { page: validPage, limit: validLimit } = PaginationHelper.validateParams(
        page,
        limit
      );

      // Build search query
      const query = SearchHelper.buildSearchQuery(filters);

      // Build sort query
      const sortQuery = SearchHelper.buildSortQuery(sort, !!filters.keyword);

      // Calculate skip
      const skip = PaginationHelper.getSkip(validPage, validLimit);


      console.log("FINAL QUERY going to MongoDB:", JSON.stringify(query, null, 2));
      console.log("FINAL SORT:", JSON.stringify(sortQuery, null, 2));

      // Execute search with pagination
      const [mentors, total] = await Promise.all([
        mentorRepository.findAll(query, sortQuery, skip, validLimit),
        mentorRepository.count(query),
      ]);

      logger.info(`Found ${mentors.length} mentors out of ${total} total`);

      // Enrich mentors with user and company data
      const enrichedMentors = await this.enrichMentorsWithRelations(
        mentors as any[],
        authToken
      );

      // Calculate pagination metadata
      const meta = PaginationHelper.calculateMeta({
        page: validPage,
        limit: validLimit,
        total,
      });

      logger.info(`service response data
        mentors: ${enrichedMentors},
        total: ${meta.total},
        page: ${meta.page},
        limit: ${meta.limit},
        ${filters}`);

      const parseData = await JSON.parse(JSON.stringify(enrichedMentors));
      console.log("parseData", parseData);

      return {
        mentors: parseData,
        total: meta.total,
        page: meta.page,
        limit: meta.limit,
        totalPages: meta.totalPages,
        hasNext: meta.hasNext,
        hasPrev: meta.hasPrev,
        filters,
      };
    } catch (error: any) {
      logger.error('Search mentors failed:', error);
      throw error;
    }
  }

  /**
   * Get all domain categories with mentor counts
   */
  async getDomainCategories(): Promise<DomainWithCount[]> {
    try {
      logger.info('Fetching domain categories with counts');

      const domains = Object.values(Domain);

      const domainCounts = await Promise.all(
        domains.map(async (domain) => {
          const pipeline = [
            {
              $match: {
                domains: domain,
                status: 'active',
                isDeleted: false,
              },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                avgQuickCall: { $avg: '$pricing.quickCall' },
                avgDeepDive: { $avg: '$pricing.deepDive' },
                topMentors: {
                  $push: {
                    id: '$_id',
                    rating: '$stats.averageRating',
                    sessions: '$stats.totalSessions',
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
                count: 1,
                avgPrice: {
                  $avg: ['$avgQuickCall', '$avgDeepDive'],
                },
                topMentors: {
                  $slice: [
                    {
                      $sortArray: {
                        input: '$topMentors',
                        sortBy: { rating: -1, sessions: -1 },
                      },
                    },
                    3,
                  ],
                },
              },
            },
          ];

          const result = await mentorRepository.aggregateDomains(pipeline);

          if (result.length === 0) {
            return {
              domain,
              label: getDomainLabel(domain), // ✅ Using imported helper
              mentorCount: 0,
              averagePrice: 0,
              topMentors: [],
            };
          }

          const data = result[0];

          return {
            domain,
            label: getDomainLabel(domain), // ✅ Using imported helper
            mentorCount: data.count || 0,
            averagePrice: Math.round(data.avgPrice || 0),
            topMentors: data.topMentors.map((m: any) => m.id.toString()),
          };
        })
      );

      // Sort by mentor count (descending)
      domainCounts.sort((a, b) => b.mentorCount - a.mentorCount);

      logger.info(`Fetched ${domainCounts.length} domain categories`);

      // const parseData = await

      return domainCounts;
    } catch (error: any) {
      logger.error('Failed to fetch domain categories:', error);
      throw error;
    }
  }

  /**
   * Get companies with mentor counts
   */
  async getCompaniesWithMentorCount(
    authToken?: string
  ): Promise<CompanyWithCount[]> {
    try {
      logger.info('Fetching companies with mentor counts');

      // Aggregate mentor counts per company
      const pipeline = [
        {
          $match: {
            status: 'active',
            isDeleted: false,
            companyId: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$companyId',
            mentorCount: { $sum: 1 },
            avgRating: { $avg: '$stats.averageRating' },
          },
        },
        {
          $sort: { mentorCount: -1 as const },
        },
        {
          $limit: 50, // Top 50 companies
        },
      ];

      const companyStats = await mentorRepository.aggregateCompanies(pipeline);

      logger.info(`Found ${companyStats.length} companies with mentors`);

      // Skip company enrichment in test mode
      // if (isTestMode()) {
      //   logger.warn('⚠️  TEST MODE: Skipping company enrichment');
      //   return companyStats.map((stat) => ({
      //     companyId: stat._id,
      //     companyName: `Company ${stat._id}`,
      //     mentorCount: stat.mentorCount,
      //     averageRating: Math.round(stat.avgRating * 10) / 10,
      //   }));
      // }

      // Fetch company details from Company Service
      const companyIds = companyStats.map((stat: any) => stat._id);

      let companies: ICompany[] = [];
      try {
        // companies = await Company.getCompaniesByIds(companyIds, authToken) as unknown as ICompany[];
        companies = await Company.getCompaniesByIds(companyIds, authToken) as unknown as ICompany[];

      } catch (error: any) {
        logger.warn('Failed to fetch company details, using IDs only');
      }

      // Merge company data with mentor counts
      const companiesWithCount = companyStats.map((stat) => {
        const company = companies.find((c) => c._id === stat._id);

        return {
          companyId: stat._id,
          companyName: company?.name || `Company ${stat._id}`,
          companyLogo: company?.logo,
          mentorCount: stat.mentorCount,
          averageRating: Math.round(stat.avgRating * 10) / 10,
        };
      });

      logger.info(`Enriched ${companiesWithCount.length} companies with data`);

      return companiesWithCount;
    } catch (error: any) {
      logger.error('Failed to fetch companies with mentor count:', error);
      throw error;
    }
  }

  /**
   * Get autocomplete suggestions for search
   */

  // async getSearchSuggestions(keyword: string, limit: number = 10): Promise<any[]> {
  //   try {
  //     if (!keyword || keyword.trim().length < 2) return [];

  //     const sanitizedKeyword = SearchHelper.sanitizeKeyword(keyword);
  //     if (!sanitizedKeyword) return [];

  //     const mentors = await Mentor.find({
  //       status: 'active',
  //       isDeleted: false,
  //       $or: [
  //         { skills: { $regex: sanitizedKeyword, $options: 'i' } },
  //         { domains: { $regex: sanitizedKeyword, $options: 'i' } },
  //         { title: { $regex: sanitizedKeyword, $options: 'i' } },
  //         { 'experience.currentRole': { $regex: sanitizedKeyword, $options: 'i' } },
  //       ],
  //     })
  //       .select('skills domains title experience.currentRole')
  //       .limit(limit * 2)
  //       .lean()
  //       .exec();

  //     // ✅ NEW - Return suggestions WITH type info
  //     const suggestions: Array<{ text: string; type: 'skill' | 'domain' | 'title' | 'role' }> = [];
  //     const seen = new Set<string>();

  //     mentors.forEach((mentor: any) => {
  //       // Add matching skills
  //       mentor.skills?.forEach((skill: string) => {
  //         if (skill.toLowerCase().includes(sanitizedKeyword.toLowerCase()) && !seen.has(skill)) {
  //           suggestions.push({ text: skill, type: 'skill' });
  //           seen.add(skill);
  //         }
  //       });

  //       // Add matching domains
  //       mentor.domains?.forEach((domain: string) => {
  //         const label = getDomainLabel(domain as Domain);
  //         if (label.toLowerCase().includes(sanitizedKeyword.toLowerCase()) && !seen.has(label)) {
  //           suggestions.push({ text: label, type: 'domain' });
  //           seen.add(label);
  //         }
  //       });

  //       // Add title if matches
  //       if (mentor.title && mentor.title.toLowerCase().includes(sanitizedKeyword.toLowerCase()) && !seen.has(mentor.title)) {
  //         suggestions.push({ text: mentor.title, type: 'title' });
  //         seen.add(mentor.title);
  //       }

  //       // Add current role if matches
  //       if (mentor.experience?.currentRole &&
  //         mentor.experience.currentRole.toLowerCase().includes(sanitizedKeyword.toLowerCase()) &&
  //         !seen.has(mentor.experience.currentRole)) {
  //         suggestions.push({ text: mentor.experience.currentRole, type: 'role' });
  //         seen.add(mentor.experience.currentRole);
  //       }
  //     });

  //     return suggestions.slice(0, limit);
  //   } catch (error: any) {
  //     logger.error('Failed to get search suggestions:', error);
  //     return [];
  //   }
  // }
  async getSearchSuggestions(
    keyword: string,
    limit: number = 10
  ): Promise<string[]> {
    try {
      if (!keyword || keyword.trim().length < 2) {
        return [];
      }

      const sanitizedKeyword = SearchHelper.sanitizeKeyword(keyword);
      if (!sanitizedKeyword) return [];

      // Search in skills, domains, and mentor titles
      const mentors = await mentorRepository.findForSuggestions(sanitizedKeyword, limit * 2);

      // Extract unique suggestions
      // ✅ NEW - Return suggestions WITH type info
      // Remove this line:
      // const suggestions: Array<{ text: string; type: 'skill' | 'domain' | 'title' | 'role' }> = [];
      // const seen = new Set<string>();

      const suggestions = new Set<string>();

      mentors.forEach((mentor: any) => {
        // Add matching skills
        mentor.skills?.forEach((skill: string) => {
          if (skill.toLowerCase().includes(sanitizedKeyword.toLowerCase())) {
            suggestions.add(skill);
          }
        });

        // Add matching domains
        mentor.domains?.forEach((domain: string) => {
          if (domain.toLowerCase().includes(sanitizedKeyword.toLowerCase())) {
            suggestions.add(getDomainLabel(domain as Domain)); // ✅ Using imported helper
          }
        });

        // Add title if matches
        if (
          mentor.title &&
          mentor.title.toLowerCase().includes(sanitizedKeyword.toLowerCase())
        ) {
          suggestions.add(mentor.title);
        }

        // Add current role if matches
        if (
          mentor.experience?.currentRole &&
          mentor.experience.currentRole
            .toLowerCase()
            .includes(sanitizedKeyword.toLowerCase())
        ) {
          suggestions.add(mentor.experience.currentRole);
        }
      });

      return Array.from(suggestions).slice(0, limit);
    } catch (error: any) {
      logger.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  /**
   * Enrich multiple mentors with user and company data
   */
  private async enrichMentorsWithRelations(
    mentors: any[],
    authToken?: string
  ): Promise<MentorWithRelations[]> {
    try {
      logger.info(`🟢 Enriching ${mentors.length} mentors with user and company data...`);

      // Collect unique user IDs
      const userIds = [...new Set(mentors.map((m) => m.userId).filter(Boolean))];

      let userMap = new Map<string, any>();

      // Only fetch if there are userIds
      if (userIds.length > 0) {
        const users = await User.find({ userId: { $in: userIds } }).lean();
        userMap = new Map(users.map((u) => [u.userId, u]));
        logger.info(`✅ Fetched ${users.length} users for enrichment`);
      }

      // Company part: Agar abhi Company use kar rahe ho aur replace nahi karna chahti, to chhod do
      // Warna agar direct Company model hai to usse bhi replace kar sakti ho
      // Abhi ke liye company wala part same rakha hai (kyunki company model nahi diya tune)

      const companyIds = [...new Set(mentors.map((m) => m.companyId).filter(Boolean))];
      let companyMap = new Map<string, any>();

      if (companyIds.length > 0) {
        try {
          const companies = await Company.getCompaniesByIds(companyIds, authToken);
          companyMap = new Map(companies.map((c: any) => [c._id, c]));
          logger.info(`✅ Fetched ${companies.length} companies`);
        } catch (error: any) {
          logger.warn('Failed to fetch companies in bulk', { error: error.message });
        }
      }

      // Enrich each mentor
      return mentors.map((mentor) => ({
        ...mentor,
        user: userMap.get(mentor.userId) || null,
        company: mentor.companyId ? companyMap.get(mentor.companyId) || null : undefined,
      }));

    } catch (error: any) {
      logger.error('Failed to enrich mentors with relations:', error);
      // Fallback: return mentors without enrichment
      return mentors.map((mentor) => ({
        ...mentor,
        user: null,
        company: null,
      }));
    }
  }
}

export default new SearchService();