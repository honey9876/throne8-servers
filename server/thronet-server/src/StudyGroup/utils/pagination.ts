/**
 * ====================================
 * PAGINATION UTILITY
 * ====================================
 * Handles pagination logic for API responses
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Default pagination values
 */
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100,
};

/**
 * Calculate pagination parameters
 */
export const calculatePagination = (
  params: PaginationParams
): { page: number; limit: number; skip: number } => {
  const page = Math.max(1, Number(params.page) || PAGINATION_DEFAULTS.PAGE);
  const limit = Math.min(
    Math.max(1, Number(params.limit) || PAGINATION_DEFAULTS.LIMIT),
    PAGINATION_DEFAULTS.MAX_LIMIT
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Generate pagination metadata
 */
export const generatePaginationMeta = (
  page: number,
  limit: number,
  totalItems: number
): PaginationResult => {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    totalPages,
    totalItems,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/**
 * Validate pagination parameters
 */
export const validatePagination = (params: PaginationParams): boolean => {
  const page = Number(params.page);
  const limit = Number(params.limit);

  // Page must be positive integer
  if (params.page && (!Number.isInteger(page) || page < 1)) {
    return false;
  }

  // Limit must be positive integer and within max limit
  if (
    params.limit &&
    (!Number.isInteger(limit) ||
      limit < 1 ||
      limit > PAGINATION_DEFAULTS.MAX_LIMIT)
  ) {
    return false;
  }

  return true;
};

export default {
  calculatePagination,
  generatePaginationMeta,
  validatePagination,
  PAGINATION_DEFAULTS,
};