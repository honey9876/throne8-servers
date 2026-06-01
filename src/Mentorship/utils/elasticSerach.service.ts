// services/elasticsearch/mentor.elasticsearch.service.ts (NEW FILE)

import esClient from '@/config/cache/elasticsearch';
import { elasticsearchConfig } from '@/config/cache/elasticsearch';
import { logger } from '@/shared/logger.util';

const MENTOR_INDEX = `${elasticsearchConfig.indices.prefix}_mentors`;

class MentorElasticsearchService {
  /**
   * Check if Elasticsearch is enabled
   */
  private isEnabled(): boolean {
    return elasticsearchConfig.enabled && esClient !== null;
  }

  /**
   * Initialize mentors index
   */
  async initializeIndex() {
    if (!this.isEnabled() || !esClient) {
      logger.warn('⚠️  Elasticsearch disabled - skipping mentor index initialization');
      return;
    }

    try {
      const indexExists = await esClient.indices.exists({ index: MENTOR_INDEX });

      if (!indexExists) {
        const mentorConfig = elasticsearchConfig.indices.mentors;
        
        await esClient.indices.create({
          index: MENTOR_INDEX,
          settings: mentorConfig.settings as any,
          mappings: mentorConfig.mappings as any
        });
        
        logger.info(`✅ Elasticsearch mentor index created: ${MENTOR_INDEX}`);
      } else {
        logger.info(`ℹ️  Mentor index already exists: ${MENTOR_INDEX}`);
      }
    } catch (error: any) {
      logger.error('❌ Failed to initialize Elasticsearch mentor index:', error);
      throw error;
    }
  }

  /**
   * Index a single mentor
   */
  async indexMentor(mentor: any) {
    if (!this.isEnabled() || !esClient) {
      logger.warn('⚠️  Elasticsearch disabled - skipping mentor indexing');
      return;
    }

    try {
      await esClient.index({
        index: MENTOR_INDEX,
        id: mentor._id.toString(),
        document: {
          userId: mentor.userId,
          title: mentor.title,
          bio: mentor.bio,
          tagline: mentor.tagline,
          skills: mentor.skills || [],
          domains: mentor.domains || [],
          currentRole: mentor.experience?.currentRole,
          companyId: mentor.companyId,
          status: mentor.status,
          averageRating: mentor.stats?.averageRating || 0,
          totalSessions: mentor.stats?.totalSessions || 0,
          totalReviews: mentor.stats?.totalReviews || 0,
          quickCallPrice: mentor.pricing?.quickCall || 0,
          deepDivePrice: mentor.pricing?.deepDive || 0,
          experienceYears: mentor.experience?.total || 0,
          experienceLevel: mentor.experience?.level,
          languages: mentor.languages || [],
          isVerified: mentor.verification?.isVerified || false,
          isFeatured: mentor.featured?.isFeatured || false,
          isDeleted: mentor.isDeleted || false,
          createdAt: mentor.createdAt,
          updatedAt: mentor.updatedAt
        },
        refresh: true
      });

      logger.info(`✅ Mentor indexed: ${mentor._id}`);
    } catch (error: any) {
      logger.error(`❌ Failed to index mentor ${mentor._id}:`, error);
    }
  }

  /**
   * Search mentors
   */
  async searchMentors(params: {
    keyword?: string;
    domains?: string[];
    companyIds?: string[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    maxRating?: number;
    minExperience?: number;
    maxExperience?: number;
    experienceLevel?: string[];
    languages?: string[];
    skills?: string[];
    verified?: boolean;
    featured?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    if (!this.isEnabled() || !esClient) {
      throw new Error('Elasticsearch is not enabled');
    }

    try {
      const {
        keyword,
        domains,
        companyIds,
        minPrice,
        maxPrice,
        minRating,
        maxRating,
        minExperience,
        maxExperience,
        experienceLevel,
        languages,
        skills,
        verified,
        featured,
        sortBy = 'averageRating',
        sortOrder = 'desc',
        page = 1,
        limit = 10
      } = params;

      const must: any[] = [
        { term: { status: 'active' } },
        { term: { isDeleted: false } }
      ];
      const filter: any[] = [];
      const should: any[] = [];

      // Keyword search
      if (keyword && keyword.trim()) {
        must.push({
          multi_match: {
            query: keyword.trim(),
            fields: [
              'title^4',
              'skills^3',
              'currentRole^2',
              'bio',
              'tagline'
            ],
            type: 'best_fields',
            fuzziness: elasticsearchConfig.search.fuzzy.fuzziness,
            operator: 'or'
          }
        });
      }

      // Filters
      if (domains?.length) {
        filter.push({ terms: { domains } });
      }

      if (companyIds?.length) {
        filter.push({ terms: { companyId: companyIds } });
      }

      if (skills?.length) {
        filter.push({ terms: { skills } });
      }

      if (languages?.length) {
        filter.push({ terms: { languages } });
      }

      if (experienceLevel?.length) {
        filter.push({ terms: { experienceLevel } });
      }

      if (verified !== undefined) {
        filter.push({ term: { isVerified: verified } });
      }

      if (featured !== undefined) {
        filter.push({ term: { isFeatured: featured } });
      }

      // Range filters
      if (minRating !== undefined || maxRating !== undefined) {
        const range: any = {};
        if (minRating !== undefined) range.gte = minRating;
        if (maxRating !== undefined) range.lte = maxRating;
        filter.push({ range: { averageRating: range } });
      }

      if (minExperience !== undefined || maxExperience !== undefined) {
        const range: any = {};
        if (minExperience !== undefined) range.gte = minExperience;
        if (maxExperience !== undefined) range.lte = maxExperience;
        filter.push({ range: { experienceYears: range } });
      }

      // Price range
      if (minPrice !== undefined || maxPrice !== undefined) {
        const priceRange: any = {};
        if (minPrice !== undefined) priceRange.gte = minPrice;
        if (maxPrice !== undefined) priceRange.lte = maxPrice;

        should.push(
          { range: { quickCallPrice: priceRange } },
          { range: { deepDivePrice: priceRange } }
        );
      }

      // Sorting
      const sort: any[] = [];
      
      if (keyword) {
        sort.push({ _score: sortOrder });
      }

      const sortFieldMap: Record<string, string> = {
        rating: 'averageRating',
        experience: 'experienceYears',
        price: 'quickCallPrice',
        sessions: 'totalSessions',
        createdAt: 'createdAt'
      };

      const esSortField = sortFieldMap[sortBy] || 'averageRating';
      sort.push({ [esSortField]: sortOrder });

      // Execute search
      const response = await esClient.search({
        index: MENTOR_INDEX,
        from: (page - 1) * limit,
        size: limit,
        query: {
          bool: {
            must,
            filter,
            ...(should.length > 0 && { should, minimum_should_match: 1 })
          }
        },
        sort
      });

      const mentorIds = response.hits.hits.map(hit => hit._id);
      const total = typeof response.hits.total === 'number' 
        ? response.hits.total 
        : response.hits.total?.value || 0;

      return {
        mentorIds,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error: any) {
      logger.error('❌ Elasticsearch search failed:', error);
      throw error;
    }
  }

  /**
   * Delete mentor from index
   */
  async deleteMentor(mentorId: string) {
    if (!this.isEnabled() || !esClient) return;

    try {
      await esClient.delete({
        index: MENTOR_INDEX,
        id: mentorId,
        refresh: true
      });
      logger.info(`✅ Mentor deleted from ES: ${mentorId}`);
    } catch (error: any) {
      if (error.meta?.statusCode !== 404) {
        logger.error(`❌ Failed to delete mentor ${mentorId}:`, error);
      }
    }
  }

  /**
   * Bulk index mentors
   */
  async bulkIndexMentors(mentors: any[]) {
    if (!this.isEnabled() || !esClient) {
      logger.warn('⚠️  Elasticsearch disabled - skipping bulk indexing');
      return;
    }

    try {
      const operations = mentors.flatMap(mentor => [
        { index: { _index: MENTOR_INDEX, _id: mentor._id.toString() } },
        {
          userId: mentor.userId,
          title: mentor.title,
          bio: mentor.bio,
          tagline: mentor.tagline,
          skills: mentor.skills || [],
          domains: mentor.domains || [],
          currentRole: mentor.experience?.currentRole,
          companyId: mentor.companyId,
          status: mentor.status,
          averageRating: mentor.stats?.averageRating || 0,
          totalSessions: mentor.stats?.totalSessions || 0,
          totalReviews: mentor.stats?.totalReviews || 0,
          quickCallPrice: mentor.pricing?.quickCall || 0,
          deepDivePrice: mentor.pricing?.deepDive || 0,
          experienceYears: mentor.experience?.total || 0,
          experienceLevel: mentor.experience?.level,
          languages: mentor.languages || [],
          isVerified: mentor.verification?.isVerified || false,
          isFeatured: mentor.featured?.isFeatured || false,
          isDeleted: mentor.isDeleted || false,
          createdAt: mentor.createdAt,
          updatedAt: mentor.updatedAt
        }
      ]);

      const response = await esClient.bulk({ operations, refresh: true });

      if (response.errors) {
        logger.error('❌ Some documents failed to index');
      } else {
        logger.info(`✅ Bulk indexed ${mentors.length} mentors`);
      }

      return response;
    } catch (error: any) {
      logger.error('❌ Bulk indexing failed:', error);
      throw error;
    }
  }

  /**
   * Autocomplete suggestions
   */
  async getAutocompleteSuggestions(prefix: string, limit: number = 10) {
    if (!this.isEnabled() || !esClient) return [];

    try {
      const response = await esClient.search({
        index: MENTOR_INDEX,
        size: limit,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: prefix,
                  fields: ['title', 'skills', 'currentRole'],
                  type: 'bool_prefix'
                }
              },
              { term: { status: 'active' } },
              { term: { isDeleted: false } }
            ]
          }
        },
        _source: ['title', 'skills', 'currentRole']
      });

      const suggestions = new Set<string>();
      
      response.hits.hits.forEach((hit: any) => {
        const source = hit._source;
        if (source.title?.toLowerCase().includes(prefix.toLowerCase())) {
          suggestions.add(source.title);
        }
        source.skills?.forEach((skill: string) => {
          if (skill.toLowerCase().includes(prefix.toLowerCase())) {
            suggestions.add(skill);
          }
        });
        if (source.currentRole?.toLowerCase().includes(prefix.toLowerCase())) {
          suggestions.add(source.currentRole);
        }
      });

      return Array.from(suggestions).slice(0, limit);
    } catch (error: any) {
      logger.error('❌ Autocomplete failed:', error);
      return [];
    }
  }
}

export default new MentorElasticsearchService();