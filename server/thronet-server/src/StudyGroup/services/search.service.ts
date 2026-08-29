// services/search.service.ts

import groupRepository from '../repositories/group.repository';
import { buildCombinedFilter, getSortObject, isValidSortOption } from '../utils/sortFilter';
import { calculatePagination, generatePaginationMeta, validatePagination } from '../utils/pagination';
import { BadRequestError } from '@/shared/errors/app.error';
import { logger } from '@/shared/logger.util';
import GroupService from './group.service';

class SearchService {

 async searchGroups(query: any, userId?: string): Promise<any> {
  const {
    search, category, visibility, tags,
    hasSpace, minHours, maxHours, sort,
    page, limit,
    cameraRequired,  // ← ADD to destructure
  } = query;

  if (!validatePagination({ page, limit })) {
    throw new BadRequestError('Invalid pagination parameters');
  }

  if (!isValidSortOption(sort)) {
    throw new BadRequestError('Invalid sort option');
  }

  const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
    page: Number(page),
    limit: Number(limit),
  });

  const filter = buildCombinedFilter({
    search,
    category,
    visibility,
    tags,
    hasSpace: hasSpace === 'true',
    minHours: minHours ? Number(minHours) : undefined,
    maxHours: maxHours ? Number(maxHours) : undefined,
    isActive: true,
    // ← correctly pass cameraRequired after destructuring it
    cameraRequired: cameraRequired !== undefined
      ? (cameraRequired === 'true' || cameraRequired === true)
      : undefined,
  });

  // ← REMOVE the filters/combinedFilter block — it was wrong

  const sortObject = getSortObject(sort);

  const [groups, totalCount] = await Promise.all([
    groupRepository.findAll(filter, sortObject, skip, pageLimit),
    groupRepository.count(filter),
  ]);

  const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);

  const formattedGroups = await Promise.all(
    groups.map(g => GroupService.formatGroupResponse(g, userId))
  );

  logger.info(`Search returned ${formattedGroups.length} groups`);
  return { pagination, groups: formattedGroups };
}

  async getPopularGroups(limit?: string, userId?: string): Promise<any> {
    const pageLimit = Math.min(Number(limit) || 10, 50);
    const filter = { isActive: true, visibility: 'public' };
    const sort = { currentMemberCount: -1, createdAt: -1 };
    const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
    const formattedGroups = await Promise.all(
      groups.map(g => GroupService.formatGroupResponse(g, userId))
    );
    return { total: formattedGroups.length, groups: formattedGroups };
  }

  async getTrendingGroups(limit?: string, userId?: string): Promise<any> {
    const pageLimit = Math.min(Number(limit) || 10, 50);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const filter = { isActive: true, visibility: 'public', updatedAt: { $gte: sevenDaysAgo } };
    const sort = { updatedAt: -1, currentMemberCount: -1 };
    const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
    const formattedGroups = await Promise.all(
      groups.map(g => GroupService.formatGroupResponse(g, userId))
    );
    return { total: formattedGroups.length, groups: formattedGroups };
  }

  async getRecommendedGroups(category?: string, limit?: string, userId?: string): Promise<any> {
    const pageLimit = Math.min(Number(limit) || 10, 50);
    const filter: any = { isActive: true, visibility: 'public' };
    if (category) filter.category = category;
    const sort = { currentMemberCount: -1, createdAt: -1 };
    const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
    const formattedGroups = await Promise.all(
      groups.map(g => GroupService.formatGroupResponse(g, userId))
    );
    return { total: formattedGroups.length, groups: formattedGroups };
  }

  // async searchGroups(query: any): Promise<any> {
  //   const { search, category, visibility, tags, hasSpace, minHours, maxHours, sort, page, limit } = query;

  //   if (!validatePagination({ page, limit })) {
  //     throw new BadRequestError('Invalid pagination parameters');
  //   }

  //   if (!isValidSortOption(sort)) {
  //     throw new BadRequestError('Invalid sort option');
  //   }

  //   const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
  //     page: Number(page),
  //     limit: Number(limit),
  //   });

  //   const filter = buildCombinedFilter({
  //     search,
  //     category,
  //     visibility,
  //     tags,
  //     hasSpace: hasSpace === 'true',
  //     minHours: minHours ? Number(minHours) : undefined,
  //     maxHours: maxHours ? Number(maxHours) : undefined,
  //     isActive: true,
  //   });

  //   const sortObject = getSortObject(sort);

  //   const [groups, totalCount] = await Promise.all([
  //     groupRepository.findAll(filter, sortObject, skip, pageLimit),
  //     groupRepository.count(filter),
  //   ]);

  //   const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);
  //   logger.info(`Search returned ${groups.length} groups`);

  //   return { pagination, groups };
  // }

  // async getPopularGroups(limit?: string): Promise<any> {
  //   const pageLimit = Math.min(Number(limit) || 10, 50);

  //   const filter = { isActive: true, visibility: 'public' };
  //   const sort = { currentMemberCount: -1, createdAt: -1 };

  //   const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
  //   return { total: groups.length, groups };
  // }

  // async getTrendingGroups(limit?: string): Promise<any> {
  //   const pageLimit = Math.min(Number(limit) || 10, 50);

  //   const sevenDaysAgo = new Date();
  //   sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  //   const filter = {
  //     isActive: true,
  //     visibility: 'public',
  //     updatedAt: { $gte: sevenDaysAgo },
  //   };
  //   const sort = { updatedAt: -1, currentMemberCount: -1 };

  //   const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
  //   return { total: groups.length, groups };
  // }

  // async getRecommendedGroups(category?: string, limit?: string): Promise<any> {
  //   const pageLimit = Math.min(Number(limit) || 10, 50);

  //   const filter: any = { isActive: true, visibility: 'public' };
  //   if (category) filter.category = category;

  //   const sort = { currentMemberCount: -1, createdAt: -1 };

  //   const groups = await groupRepository.findAll(filter, sort, 0, pageLimit);
  //   return { total: groups.length, groups };
  // }

  // async getGroupsByCategory(category: string, query: any): Promise<any> {
  //   if (!category) throw new BadRequestError('Category is required');

  //   const { page, limit, sort } = query;

  //   if (!validatePagination({ page, limit })) {
  //     throw new BadRequestError('Invalid pagination parameters');
  //   }

  //   const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
  //     page: Number(page),
  //     limit: Number(limit),
  //   });

  //   // const upperCategory = category.toUpperCase();
  //   // const filter = { category: upperCategory, isActive: true };

  //   // Use case-insensitive regex instead of toUpperCase
  //   const filter = {
  //     category: { $regex: new RegExp(`^${category}$`, 'i') },
  //     isActive: true
  //   };
  //   const sortObject = getSortObject(sort);

  //   const [groups, totalCount] = await Promise.all([
  //     groupRepository.findAll(filter, sortObject, skip, pageLimit),
  //     groupRepository.count(filter),
  //   ]);

  //   const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);
  //   return { pagination, groups, category };
  // }

  async getGroupsByCategory(category: string, query: any, userId?: string): Promise<any> {
    if (!category) throw new BadRequestError('Category is required');

    const { page, limit, sort } = query;

    if (!validatePagination({ page, limit })) {
      throw new BadRequestError('Invalid pagination parameters');
    }

    const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
      page: Number(page),
      limit: Number(limit),
    });

    const filter = {
      category: { $regex: new RegExp(`^${category}$`, 'i') },
      isActive: true
    };

    const sortObject = getSortObject(sort);

    const [groups, totalCount] = await Promise.all([
      groupRepository.findAll(filter, sortObject, skip, pageLimit),
      groupRepository.count(filter),
    ]);

    // const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);
    // return { pagination, groups, category };
    const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);

    const formattedGroups = await Promise.all(
      groups.map(g => GroupService.formatGroupResponse(g, userId))
    );

    return { pagination, groups: formattedGroups, category };
  }

  async getAvailableGroups(query: any): Promise<any> {
    const { page, limit } = query;

    if (!validatePagination({ page, limit })) {
      throw new BadRequestError('Invalid pagination parameters');
    }

    const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
      page: Number(page),
      limit: Number(limit),
    });

    const filter = {
      isActive: true,
      visibility: 'public',
      $expr: { $lt: ['$currentMemberCount', '$capacity'] },
    };
    const sort = { currentMemberCount: 1 };

    const [groups, totalCount] = await Promise.all([
      groupRepository.findAll(filter, sort, skip, pageLimit),
      groupRepository.count(filter),
    ]);

    const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);
    return { pagination, groups };
  }

  async searchGroupsByTags(query: any): Promise<any> {
    const { tags, page, limit } = query;

    if (!tags) throw new BadRequestError('Tags parameter is required');

    if (!validatePagination({ page, limit })) {
      throw new BadRequestError('Invalid pagination parameters');
    }

    const { page: currentPage, limit: pageLimit, skip } = calculatePagination({
      page: Number(page),
      limit: Number(limit),
    });

    const tagArray = Array.isArray(tags) ? tags : [tags];
    const filter = {
      isActive: true,
      tags: { $in: tagArray.map((tag: string) => new RegExp(tag, 'i')) },
    };
    const sort = { createdAt: -1 };

    const [groups, totalCount] = await Promise.all([
      groupRepository.findAll(filter, sort, skip, pageLimit),
      groupRepository.count(filter),
    ]);

    const pagination = generatePaginationMeta(currentPage, pageLimit, totalCount);
    return { pagination, groups };
  }
}

export default new SearchService();