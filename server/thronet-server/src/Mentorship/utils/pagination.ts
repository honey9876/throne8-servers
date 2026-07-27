export interface PaginationParams {
  page: number;
  limit: number;
  total: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SearchPaginationMeta extends PaginationMeta {
  query?: string;
  filters?: Record<string, any>;
  resultsFrom: number;
  resultsTo: number;
}

export class PaginationHelper {
  /**
   * Calculate pagination metadata
   */
  static calculateMeta(params: PaginationParams): PaginationMeta {
    const { page, limit, total } = params;
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Calculate search-specific pagination metadata
   */
  static calculateSearchMeta(
    params: PaginationParams,
    query?: string,
    filters?: Record<string, any>
  ): SearchPaginationMeta {
    const { page, limit, total } = params;
    const totalPages = Math.ceil(total / limit);
    const resultsFrom = total === 0 ? 0 : (page - 1) * limit + 1;
    const resultsTo = Math.min(page * limit, total);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      query,
      filters,
      resultsFrom,
      resultsTo,
    };
  }

  /**
   * Get skip value for database query
   */
  static getSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  /**
   * Validate and normalize pagination params
   */
  static validateParams(page?: number, limit?: number): { page: number; limit: number } {
    const validPage = Math.max(1, Number(page) || 1);
    const validLimit = Math.min(100, Math.max(1, Number(limit) || 10));

    return {
      page: validPage,
      limit: validLimit,
    };
  }

  /**
   * Create paginated response
   */
  static createResponse<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): PaginatedResponse<T> {
    return {
      data,
      meta: this.calculateMeta({ page, limit, total }),
    };
  }

  /**
   * Create search paginated response
   */
  static createSearchResponse<T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
    query?: string,
    filters?: Record<string, any>
  ): { data: T[]; meta: SearchPaginationMeta } {
    return {
      data,
      meta: this.calculateSearchMeta({ page, limit, total }, query, filters),
    };
  }

  /**
   * Get pagination range text (e.g., "Showing 1-10 of 50")
   */
  static getRangeText(page: number, limit: number, total: number): string {
    if (total === 0) return 'No results';

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    return `Showing ${start}-${end} of ${total}`;
  }

  /**
   * Get search range text with query
   */
  static getSearchRangeText(
    page: number,
    limit: number,
    total: number,
    query?: string
  ): string {
    if (total === 0) {
      return query ? `No results found for "${query}"` : 'No results';
    }

    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (query) {
      return `Showing ${start}-${end} of ${total} results for "${query}"`;
    }

    return `Showing ${start}-${end} of ${total} results`;
  }

  /**
   * Calculate page numbers for pagination UI
   */
  static getPageNumbers(
    currentPage: number,
    totalPages: number,
    maxPages: number = 5
  ): number[] {
    if (totalPages <= maxPages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(maxPages / 2);
    let start = currentPage - half;
    let end = currentPage + half;

    if (start < 1) {
      start = 1;
      end = maxPages;
    }

    if (end > totalPages) {
      end = totalPages;
      start = totalPages - maxPages + 1;
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  /**
   * Get pagination info for API response
   */
  static getPaginationInfo(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    const nextPage = hasNext ? page + 1 : null;
    const prevPage = hasPrev ? page - 1 : null;

    return {
      currentPage: page,
      pageSize: limit,
      totalItems: total,
      totalPages,
      hasNext,
      hasPrev,
      nextPage,
      prevPage,
    };
  }

  /**
   * Validate page number
   */
  static isValidPage(page: number, totalPages: number): boolean {
    return page >= 1 && page <= totalPages;
  }

  /**
   * Get offset for SQL queries
   */
  static getOffset(page: number, limit: number): number {
    return this.getSkip(page, limit);
  }

  /**
   * Calculate total pages
   */
  static getTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }
}

export default PaginationHelper;