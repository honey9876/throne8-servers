/**
 * ====================================
 * SORT & FILTER UTILITY
 * ====================================
 * Handles sorting and filtering logic for search queries
 */

import { FilterQuery } from 'mongoose';

/**
 * Sort options
 */
export enum SortOption {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  MOST_MEMBERS = 'mostMembers',
  LEAST_MEMBERS = 'leastMembers',
  TOP_RANKED = 'topRanked',
  MOST_ACTIVE = 'mostActive',
}

/**
 * Sort field mapping
 */
export const SORT_MAPPING: Record<
  SortOption,
  { [key: string]: 1 | -1 }
> = {
  [SortOption.NEWEST]: { createdAt: -1 },
  [SortOption.OLDEST]: { createdAt: 1 },
  [SortOption.MOST_MEMBERS]: { currentMemberCount: -1 },
  [SortOption.LEAST_MEMBERS]: { currentMemberCount: 1 },
  [SortOption.TOP_RANKED]: { currentMemberCount: -1, createdAt: -1 }, // Fallback for now
  [SortOption.MOST_ACTIVE]: { updatedAt: -1 },
};

/**
 * Get sort object from sort parameter
 */
export const getSortObject = (sort?: string): { [key: string]: 1 | -1 } => {
  if (!sort) {
    return SORT_MAPPING[SortOption.NEWEST];
  }

  const sortOption = sort as SortOption;
  return SORT_MAPPING[sortOption] || SORT_MAPPING[SortOption.NEWEST];
};

/**
 * Build search filter query
 */
export const buildSearchFilter = (searchTerm?: string): FilterQuery<any> => {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const trimmedSearch = searchTerm.trim();

  // Use text search if available
  return {
    $or: [
      { title: { $regex: trimmedSearch, $options: 'i' } },
      { description: { $regex: trimmedSearch, $options: 'i' } },
      { tags: { $in: [new RegExp(trimmedSearch, 'i')] } },
    ],
  };
};

/**
 * Build category filter
 */
export const buildCategoryFilter = (category?: string): FilterQuery<any> => {
  if (!category) {
    return {};
  }

  return { category };
};

/**
 * Build visibility filter
 */
export const buildVisibilityFilter = (
  visibility?: string
): FilterQuery<any> => {
  if (!visibility) {
    return {};
  }

  return { visibility };
};

/**
 * Build tags filter
 */
export const buildTagsFilter = (tags?: string | string[]): FilterQuery<any> => {
  if (!tags) {
    return {};
  }

  const tagArray = Array.isArray(tags) ? tags : [tags];

  if (tagArray.length === 0) {
    return {};
  }

  return {
    tags: {
      $in: tagArray.map((tag) => new RegExp(tag, 'i')),
    },
  };
};

/**
 * Build capacity filter (groups with available slots)
 */
export const buildCapacityFilter = (
  hasSpace?: boolean
): FilterQuery<any> => {
  if (hasSpace !== true) {
    return {};
  }

  return {
    $expr: {
      $lt: ['$currentMemberCount', '$capacity'],
    },
  };
};

/**
 * Build goal hours range filter
 */
export const buildGoalHoursFilter = (
  minHours?: number,
  maxHours?: number
): FilterQuery<any> => {
  const filter: FilterQuery<any> = {};

  if (minHours !== undefined && minHours > 0) {
    filter.goalHours = { ...filter.goalHours, $gte: minHours };
  }

  if (maxHours !== undefined && maxHours > 0) {
    filter.goalHours = { ...filter.goalHours, $lte: maxHours };
  }

  return filter;
};

/**
 * Combine all filters
 */
export const buildCombinedFilter = (filters: {
  search?: string;
  category?: string;
  visibility?: string;
  tags?: string | string[];
  hasSpace?: boolean;
  minHours?: number;
  maxHours?: number;
  isActive?: boolean;
  cameraRequired?: boolean;
}): FilterQuery<any> => {
  const combinedFilter: FilterQuery<any> = {
    isActive: filters.isActive !== false, // Default to active groups only
  };

  // Search filter
  const searchFilter = buildSearchFilter(filters.search);
  if (searchFilter.$or) {
    Object.assign(combinedFilter, searchFilter);
  }

  // Category filter
  const categoryFilter = buildCategoryFilter(filters.category);
  if (categoryFilter.category) {
    combinedFilter.category = categoryFilter.category;
  }

  // Visibility filter
  const visibilityFilter = buildVisibilityFilter(filters.visibility);
  if (visibilityFilter.visibility) {
    combinedFilter.visibility = visibilityFilter.visibility;
  }

  // Tags filter
  const tagsFilter = buildTagsFilter(filters.tags);
  if (tagsFilter.tags) {
    combinedFilter.tags = tagsFilter.tags;
  }

  // Capacity filter
  const capacityFilter = buildCapacityFilter(filters.hasSpace);
  if (capacityFilter.$expr) {
    combinedFilter.$expr = capacityFilter.$expr;
  }

  // Goal hours filter
  const goalHoursFilter = buildGoalHoursFilter(
    filters.minHours,
    filters.maxHours
  );
  if (goalHoursFilter.goalHours) {
    combinedFilter.goalHours = goalHoursFilter.goalHours;
  }

  // ADD after it
  if (filters.cameraRequired !== undefined) {
    combinedFilter.cameraRequired = filters.cameraRequired;
  }


  return combinedFilter;
};

/**
 * Validate sort option
 */
export const isValidSortOption = (sort?: string): boolean => {
  if (!sort) {
    return true; // Default sort is valid
  }

  return Object.values(SortOption).includes(sort as SortOption);
};

export default {
  SortOption,
  SORT_MAPPING,
  getSortObject,
  buildSearchFilter,
  buildCategoryFilter,
  buildVisibilityFilter,
  buildTagsFilter,
  buildCapacityFilter,
  buildGoalHoursFilter,
  buildCombinedFilter,
  isValidSortOption,
};