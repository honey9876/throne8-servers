// import { appConstants } from '../config';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  skip?: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  skip: number;
  limit: number;
  hasMore: boolean;
}

const appConstants = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
}

const pagination = {
  // Calculate pagination parameters
  paginate(options: PaginationOptions): PaginationResult {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(
      options.pageSize || appConstants.DEFAULT_PAGE_SIZE,
      appConstants.MAX_PAGE_SIZE
    );
    const skip = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      skip,
      limit: pageSize,
      hasMore: false, // Will be calculated with total count
    };
  },

  // Calculate if there are more pages
  hasMore(total: number, page: number, pageSize: number): boolean {
    return page * pageSize < total;
  },

  // Get pagination metadata
  getMeta(total: number, page: number, pageSize: number) {
    const totalPages = Math.ceil(total / pageSize);
    return {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: this.hasMore(total, page, pageSize),
    };
  },
};

export default pagination;