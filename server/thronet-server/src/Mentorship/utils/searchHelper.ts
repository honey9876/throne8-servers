import { CompanyCategory } from "@/shared/constants/companies";
import { Domain } from "@/shared/constants/domains";
import { ExperienceLevel } from "@/Mentorship/interface/mentor.types";
import { Mentor } from "../models";


export interface SearchFilters {
  keyword?: string;
  domains?: Domain[];
  companyIds?: string[];
  companyCategories?: CompanyCategory[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  maxRating?: number;
  minExperience?: number;
  maxExperience?: number;
  experienceLevel?: ExperienceLevel[];
  languages?: string[];
  skills?: string[];
  featured?: boolean;
  verified?: boolean;
  availableNow?: boolean;
}

export interface SearchSortOptions {
  field: 'rating' | 'experience' | 'price' | 'sessions' | 'createdAt' | 'relevance';
  order: 'asc' | 'desc';
}

export class SearchHelper {
  /**
   * Build MongoDB query from search filters
   */

  static buildSearchQuery(filters: SearchFilters): any {
    const query: any = {
      isDeleted: false,
      status: 'active',
    };

    console.log("===== buildSearchQuery called =====");
    console.log("keyword present?", !!filters.keyword);
    console.log("full filters:", JSON.stringify(filters, null, 2));

    // ✅ Keyword search - ONLY REGEX (NO $text)
    if (filters.keyword && filters.keyword.trim()) {
      const searchRegex = { $regex: filters.keyword.trim(), $options: 'i' };

      query.$or = [
        { title: searchRegex },
        { bio: searchRegex },
        { 'experience.currentRole': searchRegex },
        { skills: searchRegex },
        { domains: searchRegex }
      ];
    }

    // ✅ Keyword search - ONLY USE REGEX (no $text operator)
    if (filters.keyword && filters.keyword.trim()) {
      const searchRegex = { $regex: filters.keyword.trim(), $options: 'i' };

      query.$or = [
        { title: searchRegex },
        { bio: searchRegex },
        { 'experience.currentRole': searchRegex },
        { skills: searchRegex },
        { domains: searchRegex }
      ];
    }

    // Domain filter
    if (filters.domains && filters.domains.length > 0) {
      query.domains = { $in: filters.domains };
    }

    // Company filter
    if (filters.companyIds && filters.companyIds.length > 0) {
      query.companyId = { $in: filters.companyIds };
    }

    // Price range filter
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const priceConditions = [];

      if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
        priceConditions.push({
          $or: [
            {
              'pricing.quickCall': {
                $gte: filters.minPrice,
                $lte: filters.maxPrice,
              },
            },
            {
              'pricing.deepDive': {
                $gte: filters.minPrice,
                $lte: filters.maxPrice,
              },
            },
          ],
        });
      } else if (filters.minPrice !== undefined) {
        priceConditions.push({
          $or: [
            { 'pricing.quickCall': { $gte: filters.minPrice } },
            { 'pricing.deepDive': { $gte: filters.minPrice } },
          ],
        });
      } else if (filters.maxPrice !== undefined) {
        priceConditions.push({
          $or: [
            { 'pricing.quickCall': { $lte: filters.maxPrice } },
            { 'pricing.deepDive': { $lte: filters.maxPrice } },
          ],
        });
      }

      if (priceConditions.length > 0) {
        query.$and = query.$and || [];
        query.$and.push(...priceConditions);
      }
    }

    // Rating range filter
    if (filters.minRating !== undefined) {
      query['stats.averageRating'] = {
        ...query['stats.averageRating'],
        $gte: filters.minRating,
      };
    }

    if (filters.maxRating !== undefined) {
      query['stats.averageRating'] = {
        ...query['stats.averageRating'],
        $lte: filters.maxRating,
      };
    }

    // Experience range filter
    if (filters.minExperience !== undefined) {
      query['experience.total'] = {
        ...query['experience.total'],
        $gte: filters.minExperience,
      };
    }

    if (filters.maxExperience !== undefined) {
      query['experience.total'] = {
        ...query['experience.total'],
        $lte: filters.maxExperience,
      };
    }

    // Experience level filter
    if (filters.experienceLevel && filters.experienceLevel.length > 0) {
      query['experience.level'] = { $in: filters.experienceLevel };
    }

    // Languages filter
    if (filters.languages && filters.languages.length > 0) {
      query.languages = { $in: filters.languages };
    }

    // Skills filter
    if (filters.skills && filters.skills.length > 0) {
      query.skills = { $in: filters.skills };
    }

    // Featured filter
    if (filters.featured !== undefined) {
      query['featured.isFeatured'] = filters.featured;
      if (filters.featured) {
        query['featured.featuredUntil'] = { $gt: new Date() };
      }
    }

    // Verified filter
    if (filters.verified !== undefined) {
      query['verification.isVerified'] = filters.verified;
    }

    // rest of function...
    console.log("Final query:", JSON.stringify(query, null, 2));
    return query;
  }
  //   static  buildSearchQuery(filters: SearchFilters): any {
  //     const query: any = {
  //       isDeleted: false,
  //       status: 'active',
  //     };

  //     if (filters.keyword) {
  //   query.$or = [
  //     { $text: { $search: filters.keyword } }, // existing indexed fields
  //     { domains: { $regex: filters.keyword, $options: 'i' } }, // domain search
  //     { expertise: { $regex: filters.keyword, $options: 'i' } } // expertise search
  //   ];
  // }

  // // const mentors = await Mentor.find(query)
  // //   .sort(sortBy === 'rating' ? { 'stats.averageRating': -1 } : { createdAt: -1 })
  // //   .limit(limit);

  //     // Keyword search (text search)
  //     if (filters.keyword && filters.keyword.trim()) {
  //       query.$text = { $search: filters.keyword.trim() };
  //     }

  //     // Domain filter
  //     if (filters.domains && filters.domains.length > 0) {
  //       query.domains = { $in: filters.domains };
  //     }

  //     // Company filter
  //     if (filters.companyIds && filters.companyIds.length > 0) {
  //       query.companyId = { $in: filters.companyIds };
  //     }

  //     // Price range filter
  //     if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
  //       const priceConditions = [];

  //       if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
  //         priceConditions.push({
  //           $or: [
  //             {
  //               'pricing.quickCall': {
  //                 $gte: filters.minPrice,
  //                 $lte: filters.maxPrice,
  //               },
  //             },
  //             {
  //               'pricing.deepDive': {
  //                 $gte: filters.minPrice,
  //                 $lte: filters.maxPrice,
  //               },
  //             },
  //           ],
  //         });
  //       } else if (filters.minPrice !== undefined) {
  //         priceConditions.push({
  //           $or: [
  //             { 'pricing.quickCall': { $gte: filters.minPrice } },
  //             { 'pricing.deepDive': { $gte: filters.minPrice } },
  //           ],
  //         });
  //       } else if (filters.maxPrice !== undefined) {
  //         priceConditions.push({
  //           $or: [
  //             { 'pricing.quickCall': { $lte: filters.maxPrice } },
  //             { 'pricing.deepDive': { $lte: filters.maxPrice } },
  //           ],
  //         });
  //       }

  //       if (priceConditions.length > 0) {
  //         query.$and = query.$and || [];
  //         query.$and.push(...priceConditions);
  //       }
  //     }

  //     // Rating range filter
  //     if (filters.minRating !== undefined) {
  //       query['stats.averageRating'] = {
  //         ...query['stats.averageRating'],
  //         $gte: filters.minRating,
  //       };
  //     }

  //     if (filters.maxRating !== undefined) {
  //       query['stats.averageRating'] = {
  //         ...query['stats.averageRating'],
  //         $lte: filters.maxRating,
  //       };
  //     }

  //     // Experience range filter
  //     if (filters.minExperience !== undefined) {
  //       query['experience.total'] = {
  //         ...query['experience.total'],
  //         $gte: filters.minExperience,
  //       };
  //     }

  //     if (filters.maxExperience !== undefined) {
  //       query['experience.total'] = {
  //         ...query['experience.total'],
  //         $lte: filters.maxExperience,
  //       };
  //     }

  //     // Experience level filter
  //     if (filters.experienceLevel && filters.experienceLevel.length > 0) {
  //       query['experience.level'] = { $in: filters.experienceLevel };
  //     }

  //     // Languages filter
  //     if (filters.languages && filters.languages.length > 0) {
  //       query.languages = { $in: filters.languages };
  //     }

  //     // Skills filter
  //     if (filters.skills && filters.skills.length > 0) {
  //       query.skills = { $in: filters.skills };
  //     }

  //     // Featured filter
  //     if (filters.featured !== undefined) {
  //       query['featured.isFeatured'] = filters.featured;
  //       if (filters.featured) {
  //         query['featured.featuredUntil'] = { $gt: new Date() };
  //       }
  //     }

  //     // Verified filter
  //     if (filters.verified !== undefined) {
  //       query['verification.isVerified'] = filters.verified;
  //     }

  //     return query;
  //   }

  /**
   * Build MongoDB sort query
   */
  //   static buildSortQuery(sort?: SearchSortOptions, hasKeyword?: boolean): any {
  //   // ✅ Remove text score sorting since we're not using $text anymore
  //   if (!sort) {
  //     return { 'stats.averageRating': -1, createdAt: -1 };
  //   }

  //   const sortMap: Record<string, string> = {
  //     rating: 'stats.averageRating',
  //     experience: 'experience.total',
  //     price: 'pricing.quickCall',
  //     sessions: 'stats.totalSessions',
  //     createdAt: 'createdAt',
  //   };

  //   const sortField = sortMap[sort.field] || 'stats.averageRating';
  //   const sortOrder = sort.order === 'asc' ? 1 : -1;

  //   return { [sortField]: sortOrder };
  // }
  static buildSortQuery(sort?: SearchSortOptions, hasKeyword?: boolean): any {
    // If keyword search, sort by text score first
    // if (hasKeyword) {
    //   return { score: { $meta: 'textScore' }, 'stats.averageRating': -1 };
    // }

    if (!sort) {
      return { 'stats.averageRating': -1, createdAt: -1 };
    }

    const sortMap: Record<string, string> = {
      rating: 'stats.averageRating',
      experience: 'experience.total',
      price: 'pricing.quickCall',
      sessions: 'stats.totalSessions',
      createdAt: 'createdAt',
    };

    const sortField = sortMap[sort.field] || 'stats.averageRating';
    const sortOrder = sort.order === 'asc' ? 1 : -1;

    return { [sortField]: sortOrder };
  }

  /**
   * Validate search filters
   */
  static validateFilters(filters: SearchFilters): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate price range
    if (filters.minPrice !== undefined && filters.minPrice < 0) {
      errors.push('Minimum price cannot be negative');
    }

    if (filters.maxPrice !== undefined && filters.maxPrice < 0) {
      errors.push('Maximum price cannot be negative');
    }

    if (
      filters.minPrice !== undefined &&
      filters.maxPrice !== undefined &&
      filters.minPrice > filters.maxPrice
    ) {
      errors.push('Minimum price cannot be greater than maximum price');
    }

    // Validate rating range
    if (filters.minRating !== undefined && (filters.minRating < 0 || filters.minRating > 5)) {
      errors.push('Minimum rating must be between 0 and 5');
    }

    if (filters.maxRating !== undefined && (filters.maxRating < 0 || filters.maxRating > 5)) {
      errors.push('Maximum rating must be between 0 and 5');
    }

    if (
      filters.minRating !== undefined &&
      filters.maxRating !== undefined &&
      filters.minRating > filters.maxRating
    ) {
      errors.push('Minimum rating cannot be greater than maximum rating');
    }

    // Validate experience range
    if (filters.minExperience !== undefined && filters.minExperience < 0) {
      errors.push('Minimum experience cannot be negative');
    }

    if (filters.maxExperience !== undefined && filters.maxExperience < 0) {
      errors.push('Maximum experience cannot be negative');
    }

    if (
      filters.minExperience !== undefined &&
      filters.maxExperience !== undefined &&
      filters.minExperience > filters.maxExperience
    ) {
      errors.push('Minimum experience cannot be greater than maximum experience');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize keyword for text search
   */
  static sanitizeKeyword(keyword?: string): string | undefined {
    if (!keyword) return undefined;

    return keyword
      .trim()
      .replace(/[^\w\s]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .substring(0, 100); // Limit length
  }

  /**
   * Parse query parameters to filters
   */
  static parseQueryParams(query: any): SearchFilters {
    const filters: SearchFilters = {};

    // Keyword
    if (query.keyword) {
      filters.keyword = this.sanitizeKeyword(query.keyword);
    }

    // Domains
    if (query.domains) {
      filters.domains = Array.isArray(query.domains)
        ? query.domains
        : query.domains.split(',');
    }

    // Company IDs
    if (query.companyIds) {
      filters.companyIds = Array.isArray(query.companyIds)
        ? query.companyIds
        : query.companyIds.split(',');
    }

    // Price range
    if (query.minPrice) {
      filters.minPrice = parseFloat(query.minPrice);
    }
    if (query.maxPrice) {
      filters.maxPrice = parseFloat(query.maxPrice);
    }

    // Rating range
    if (query.minRating) {
      filters.minRating = parseFloat(query.minRating);
    }
    if (query.maxRating) {
      filters.maxRating = parseFloat(query.maxRating);
    }

    // Experience range
    if (query.minExperience) {
      filters.minExperience = parseInt(query.minExperience);
    }
    if (query.maxExperience) {
      filters.maxExperience = parseInt(query.maxExperience);
    }

    // Experience level
    if (query.experienceLevel) {
      filters.experienceLevel = Array.isArray(query.experienceLevel)
        ? query.experienceLevel
        : query.experienceLevel.split(',');
    }

    // Languages
    if (query.languages) {
      filters.languages = Array.isArray(query.languages)
        ? query.languages
        : query.languages.split(',');
    }

    // Skills
    if (query.skills) {
      filters.skills = Array.isArray(query.skills)
        ? query.skills
        : query.skills.split(',');
    }

    // Boolean filters
    if (query.featured !== undefined) {
      filters.featured = query.featured === 'true' || query.featured === true;
    }

    if (query.verified !== undefined) {
      filters.verified = query.verified === 'true' || query.verified === true;
    }

    return filters;
  }

  /**
   * Parse sort parameters
   */
  static parseSortParams(query: any): SearchSortOptions | undefined {
    if (!query.sortBy) return undefined;

    const validFields = ['rating', 'experience', 'price', 'sessions', 'createdAt', 'relevance'];
    const field = validFields.includes(query.sortBy) ? query.sortBy : 'rating';

    const order = query.sortOrder === 'asc' ? 'asc' : 'desc';

    return { field, order };
  }
}

export default SearchHelper;