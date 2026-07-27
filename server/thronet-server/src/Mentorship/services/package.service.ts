// src/services/package.service.ts

import { NotFoundError } from '@/shared/errors/app.error';
import { Mentor, PackageCredit, Package } from '../models';
import { CreditStatus } from '../models/PackageCredit';
import { logger } from '@/shared/logger.util';
import { BadRequestError } from '@/shared/errors/app.error';
import mongoose from 'mongoose';
import { PackageType, IPackage, PackageStatus } from '../models/Package';
import mentorRepository from '../repositories/mentor.repository';
import packageRepository from '../repositories/package.repository';
import { generateSecureId } from '@/shared/security';

/**
 * Package configuration type (excludes CUSTOM)
 */
type StandardPackageType = Exclude<PackageType, PackageType.CUSTOM>;

/**
 * Package pricing configuration
 */
const PACKAGE_CONFIG: Record<StandardPackageType, {
  sessions: number;
  discountPercentage: number;
  validityDays: number;
  name: string;
  description: string;
  features: string[];
}> = {
  [PackageType.STARTER]: {
    sessions: 5,
    discountPercentage: 10,
    validityDays: 90,
    name: 'Starter Package',
    description: '5 mentorship sessions with 10% discount',
    features: [
      '5 mentorship sessions',
      '10% discount',
      'Valid for 90 days',
      'All session types included',
      'Priority support',
    ],
  },
  [PackageType.PROFESSIONAL]: {
    sessions: 10,
    discountPercentage: 15,
    validityDays: 180,
    name: 'Professional Package',
    description: '10 mentorship sessions with 15% discount',
    features: [
      '10 mentorship sessions',
      '15% discount',
      'Valid for 180 days',
      'All session types included',
      'Priority support',
      'Free rescheduling',
    ],
  },
  [PackageType.PREMIUM]: {
    sessions: 20,
    discountPercentage: 20,
    validityDays: 365,
    name: 'Premium Package',
    description: '20 mentorship sessions with 20% discount',
    features: [
      '20 mentorship sessions',
      '20% discount',
      'Valid for 365 days (1 year)',
      'All session types included',
      'VIP support',
      'Free rescheduling',
      'Exclusive mentor access',
    ],
  },
};

interface CreatePackageInput {
  packageType: PackageType;
  userId: string;
  mentorId?: string;
  paymentMethod: string;
  transactionId?: string;
  customSessions?: number;
  customPrice?: number;
}

interface PackageSummary {
  totalPackages: number;
  activePackages: number;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  totalSpent: number;
  packages: IPackage[];
}

class PackageService {
  /**
   * Create a new package
   */
  async createPackage(input: CreatePackageInput): Promise<IPackage> {
    try {
      logger.info(`📦 Creating package for user: ${input.userId}`);

      // Validate mentor if provided
      if (input.mentorId) {
        // const mentor = await Mentor.findOne({
        //   $or: [
        //     { _id: input.mentorId },      // Check by Mentor _id
        //     { userId: input.mentorId }     // Check by User ID
        //   ]
        // });


        // ✅ Replace with (UUID se dhundho)
        const mentor = await mentorRepository.findByMentorId(input.mentorId);
        if (!mentor) {
          throw new NotFoundError('Mentor not found');
        }
      }

      // Get package configuration
      const config = input.packageType !== PackageType.CUSTOM
        ? PACKAGE_CONFIG[input.packageType as StandardPackageType]
        : undefined;

      if (!config && input.packageType !== PackageType.CUSTOM) {
        throw new BadRequestError('Invalid package type');
      }

      // Calculate pricing
      let totalSessions: number;
      let pricePerSession: number;
      let discountPercentage: number;
      let validityDays: number;
      let name: string;
      let description: string;
      let features: string[];

      if (input.packageType === PackageType.CUSTOM) {
        if (!input.customSessions || !input.customPrice) {
          throw new BadRequestError('Custom sessions and price required for custom package');
        }
        totalSessions = input.customSessions;
        pricePerSession = input.customPrice / totalSessions;
        discountPercentage = 0;
        validityDays = 180;
        name = 'Custom Package';
        description = `${totalSessions} custom mentorship sessions`;
        features = [`${totalSessions} mentorship sessions`, 'Custom pricing', 'Valid for 180 days'];
      } else {
        // config is guaranteed to be defined here
        totalSessions = config!.sessions;
        discountPercentage = config!.discountPercentage;
        validityDays = config!.validityDays;
        name = config!.name;
        description = config!.description;
        features = config!.features;

        // Get mentor's base price (assuming ₹1000 per session for now)
        const basePrice = 1000;
        pricePerSession = basePrice;
      }

      // Calculate total pricing
      const actualPrice = pricePerSession * totalSessions;
      const discountAmount = (actualPrice * discountPercentage) / 100;
      const totalPrice = actualPrice - discountAmount;

      // Create package
      const packageData = new Package({
        packageType: input.packageType,
        packageId: generateSecureId(),
        name,
        description,
        totalSessions,
        usedSessions: 0,
        remainingSessions: totalSessions,
        pricePerSession,
        totalPrice,
        discountPercentage,
        actualPrice,
        validityDays,
        status: PackageStatus.ACTIVE,
        features,
        userId: input.userId,
        mentorId: input.mentorId,
        payment: {
          transactionId: input.transactionId,
          paymentMethod: input.paymentMethod,
          paidAt: new Date(),
        },
        purchasedAt: new Date(),
      });

      await packageData.save();

      // Create individual credits for the package
      await (PackageCredit as any).createCreditsForPackage(
        packageData.packageId,
        input.userId,
        totalSessions,
        packageData.expiresAt,
        input.mentorId
      );

      logger.info(`✅ Package created: ${packageData._id}`);
      return packageData;
    } catch (error: any) {
      logger.error('Failed to create package:', error);
      throw error;
    }
  }

  /**
   * Get package by ID
   */
  async getPackageById(packageId: string, userId?: string): Promise<IPackage> {
    try {
      const packageData = await packageRepository.findByPackageId(packageId);
      if (!packageData) {
        throw new NotFoundError('Package not found');
      }

      // Check ownership if userId provided
      if (userId && packageData.userId !== userId) {
        throw new BadRequestError('You do not have access to this package');
      }

      return packageData;
    } catch (error: any) {
      logger.error('Failed to get package:', error);
      throw error;
    }
  }

  /**
   * Get all packages for a user
   */
  async getUserPackages(userId: string, status?: PackageStatus): Promise<IPackage[]> {
    try {
      const query: any = { userId };

      if (status) {
        query.status = status;
      }

      // const packages = await Package.find(query).sort({ createdAt: -1 });

      // return packages;

      return await packageRepository.findByUserId(userId, status);

    } catch (error: any) {
      logger.error('Failed to get user packages:', error);
      throw error;
    }
  }

  /**
   * Get package summary for user
   */
  async getPackageSummary(userId: string): Promise<PackageSummary> {
    try {
      const packages = await packageRepository.findByUserId(userId);

      const summary: PackageSummary = {
        totalPackages: packages.length,
        activePackages: packages.filter((p: any) => p.status === PackageStatus.ACTIVE).length,
        totalSessions: packages.reduce((sum: any, p: any) => sum + p.totalSessions, 0),
        usedSessions: packages.reduce((sum: any, p: any) => sum + p.usedSessions, 0),
        remainingSessions: packages.reduce((sum: any, p: any) => sum + p.remainingSessions, 0),
        totalSpent: packages.reduce((sum: any, p: any) => sum + p.totalPrice, 0),
        packages: packages.filter((p: any) => p.status === PackageStatus.ACTIVE),
      };

      return summary;

      // return await Package.getUserPackageSummary(userId);

    } catch (error: any) {
      logger.error('Failed to get package summary:', error);
      throw error;
    }
  }

  /**
   * Use a session credit from package
   */
  async usePackageCredit(
    packageId: string,
    userId: string,
    sessionId: string,
    sessionType: string,
    sessionDate: Date
  ): Promise<void> {
    try {
      logger.info(`📦 Using credit from package: ${packageId}`);

      // // Get package
      // const packageData = await this.getPackageById(packageId, userId);

      // // Check if package can be used
      // if (!packageData.canUseSession()) {
      //   throw new BadRequestError('Package cannot be used');
      // }

      // ✅ Replace with
      const packageData = await packageRepository.useSessionAtomic(packageId);
      if (!packageData) {
        throw new BadRequestError('Package cannot be used or no sessions remaining');
      }

      const credits = await (PackageCredit as any).getAvailableCredits(
        userId,
        packageId  // UUID string
      );

      if (!credits || credits.length === 0) {
        throw new BadRequestError('No available credits in package');
      }

      const credit = credits[0];

      // Mark credit as used
      await credit.markAsUsed(sessionId, sessionType, sessionDate);

      // Update package
      await packageData.useSession();

      logger.info(`✅ Package credit used successfully`);
    } catch (error: any) {
      logger.error('Failed to use package credit:', error);
      throw error;
    }
  }

  /**
   * Get available credits for user
   */
  async getAvailableCredits(userId: string, packageId?: string): Promise<any[]> {
    try {
      const credits = await (PackageCredit as any).getAvailableCredits(
        userId,
        packageId ? packageId : undefined
      );

      return credits;
    } catch (error: any) {
      logger.error('Failed to get available credits:', error);
      throw error;
    }
  }

  /**
   * Cancel package
   */
  async cancelPackage(packageId: string, userId: string, reason: string): Promise<IPackage> {
    try {
      logger.info(`❌ Cancelling package: ${packageId}`);

      const packageData = await this.getPackageById(packageId, userId);

      if (packageData.status !== PackageStatus.ACTIVE) {
        throw new BadRequestError('Only active packages can be cancelled');
      }

      // Cancel package
      await packageData.cancelPackage(reason);

      // Mark all unused credits as refunded
      await PackageCredit.updateMany(
        {
          packageId: packageId,
          status: CreditStatus.AVAILABLE,
        },
        {
          $set: {
            status: CreditStatus.REFUNDED,
            refundReason: reason,
            refundedAt: new Date(),
          },
        }
      );

      logger.info(`✅ Package cancelled successfully`);
      return packageData;
    } catch (error: any) {
      logger.error('Failed to cancel package:', error);
      throw error;
    }
  }

  /**
   * Get package pricing info
   */
  getPackagePricing(packageType: StandardPackageType, mentorBasePrice: number = 1000): any {
    const config = PACKAGE_CONFIG[packageType];

    if (!config) {
      throw new BadRequestError('Invalid package type');
    }

    const actualPrice = mentorBasePrice * config.sessions;
    const discountAmount = (actualPrice * config.discountPercentage) / 100;
    const totalPrice = actualPrice - discountAmount;

    return {
      packageType,
      name: config.name,
      description: config.description,
      sessions: config.sessions,
      pricePerSession: mentorBasePrice,
      actualPrice,
      discountPercentage: config.discountPercentage,
      discountAmount,
      totalPrice,
      savings: discountAmount,
      validityDays: config.validityDays,
      features: config.features,
    };
  }

  /**
   * Get all package options
   */
  getAllPackageOptions(mentorBasePrice: number = 1000): any[] {
    return [
      this.getPackagePricing(PackageType.STARTER, mentorBasePrice),
      this.getPackagePricing(PackageType.PROFESSIONAL, mentorBasePrice),
      this.getPackagePricing(PackageType.PREMIUM, mentorBasePrice),
    ];
  }

  /**
   * Expire old packages (run as cron job)
   */
  async expireOldPackages(): Promise<number> {
    try {
      // const result = await Package.updateMany(
      //   {
      //     status: PackageStatus.ACTIVE,
      //     expiresAt: { $lt: new Date() },
      //   },
      //   {
      //     $set: { status: PackageStatus.EXPIRED },
      //   }
      // );

      // logger.info(`⏰ Expired ${result.modifiedCount} packages`);
      // return result.modifiedCount || 0;

      // ✅ REPLACE WITH
      return await packageRepository.markExpired();

    } catch (error: any) {
      logger.error('Failed to expire packages:', error);
      throw error;
    }
  }
}

export default new PackageService();