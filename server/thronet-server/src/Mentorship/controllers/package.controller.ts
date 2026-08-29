// src/controllers/package.controller.ts
import { PackageStatus } from '../models/Package';
import { packageService } from '../services';
import { logger } from '@/shared/logger.util';
import ResponseHandler from '@/shared/utils/mentorship/responseHandler';
import { Request, Response, NextFunction } from 'express';
// import { StandardPackageType
// import  StandardPackageType from '../models/StandardPackageType';


/**
 * @desc    Get all package pricing options
 * @route   GET /api/packages/pricing
 * @access  Public
 */
export const getPackagePricing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { mentorBasePrice } = req.query;
    const basePrice = mentorBasePrice ? parseInt(mentorBasePrice as string) : 1000;

    const packages = packageService.getAllPackageOptions(basePrice);

    ResponseHandler.success(res, 'Package pricing retrieved successfully', packages);
  } catch (error: any) {
    logger.error('Error getting package pricing:', error);
    next(error);
  }
};

/**
 * @desc    Get specific package pricing
 * @route   GET /api/packages/pricing/:packageType
 * @access  Public
 */
export const getSpecificPackagePricing = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { packageType } = req.params;
    const { mentorBasePrice } = req.query;
    const basePrice = mentorBasePrice ? parseInt(mentorBasePrice as string) : 1000;

    const packagePricing = packageService.getPackagePricing(
      // packageType as StandardPackageType,
      packageType as any,
      basePrice
    );

    ResponseHandler.success(res, 'Package pricing retrieved successfully', packagePricing);
  } catch (error: any) {
    logger.error('Error getting package pricing:', error);
    next(error);
  }
};

/**
 * @desc    Purchase a package
 * @route   POST /api/packages/purchase
 * @access  Private
 */
export const purchasePackage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const {
      packageType,
      mentorId,
      paymentMethod,
      transactionId,
      customSessions,
      customPrice,
    } = req.body;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    const packageData = await packageService.createPackage({
      packageType,
      userId,
      mentorId,
      paymentMethod,
      transactionId,
      customSessions,
      customPrice,
    });

    ResponseHandler.created(res, 'Package purchased successfully', packageData);
  } catch (error: any) {
    logger.error('Error purchasing package:', error);
    next(error);
  }
};

/**
 * @desc    Get package details by ID
 * @route   GET /api/packages/:packageId
 * @access  Private
 */
export const getPackageById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { packageId } = req.params;
    const userId = req.user?.id;

    const packageData = await packageService.getPackageById(packageId, userId);

    ResponseHandler.success(res, 'Package retrieved successfully', packageData);
  } catch (error: any) {
    logger.error('Error getting package:', error);
    next(error);
  }
};

/**
 * @desc    Get all packages for logged-in user
 * @route   GET /api/packages
 * @access  Private
 */
export const getUserPackages = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { status } = req.query;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    const packages = await packageService.getUserPackages(
      userId,
      status as PackageStatus
    );

    ResponseHandler.success(res, 'User packages retrieved successfully', packages);
  } catch (error: any) {
    logger.error('Error getting user packages:', error);
    next(error);
  }
};

/**
 * @desc    Get package summary for user
 * @route   GET /api/packages/summary
 * @access  Private
 */
export const getPackageSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    const summary = await packageService.getPackageSummary(userId);

    ResponseHandler.success(res, 'Package summary retrieved successfully', summary);
  } catch (error: any) {
    logger.error('Error getting package summary:', error);
    next(error);
  }
};

/**
 * @desc    Use a credit from package
 * @route   POST /api/packages/:packageId/use-credit
 * @access  Private
 */
export const usePackageCredit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { packageId } = req.params;
    const userId = req.user?.id;
    const { sessionId, sessionType, sessionDate } = req.body;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    // aur service call mein bhi
    await packageService.usePackageCredit(
      packageId,
      userId,
      sessionId,   // lowercase
      sessionType,
      new Date(sessionDate)
    );

    ResponseHandler.success(res, 'Package credit used successfully', null);
  } catch (error: any) {
    logger.error('Error using package credit:', error);
    next(error);
  }
};

/**
 * @desc    Get available credits for user
 * @route   GET /api/packages/credits
 * @access  Private
 */
export const getAvailableCredits = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { packageId } = req.query;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    const credits = await packageService.getAvailableCredits(
      userId,
      packageId as string
    );

    ResponseHandler.success(res, 'Available credits retrieved successfully', credits);
  } catch (error: any) {
    logger.error('Error getting available credits:', error);
    next(error);
  }
};

/**
 * @desc    Cancel package
 * @route   PUT /api/packages/:packageId/cancel
 * @access  Private
 */
export const cancelPackage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { packageId } = req.params;
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!userId) {
      ResponseHandler.unauthorized(res);
      return;
    }

    const packageData = await packageService.cancelPackage(packageId, userId, reason);

    ResponseHandler.success(res, 'Package cancelled successfully', packageData);
  } catch (error: any) {
    logger.error('Error cancelling package:', error);
    next(error);
  }
};