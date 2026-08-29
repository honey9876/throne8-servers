// src/auth/services/ folder me compliance.service.ts banao
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import geoip from 'geoip-lite';
import * as crypto from 'crypto';
import User from '@/auth/models/User.model';
import OTPVerification from '@/auth/models/OTPVerification.model';
import Session from '@/auth/models/Session.model';
import { LoggerUtil } from '@/shared/logger.util';
import CacheUtil from '@/shared/cache.util';
import NotificationService from './notification.service';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import Constants from '@/shared/constants.util';

interface ComplianceStatus {
    requiresReVerification: boolean;
    daysSinceChange: number;
    lastPasswordChange: Date;
    nextRequiredChange: Date | string;
}

interface AnnualIdentityStatus {
    requiresIdentityReCheck: boolean;
    requiresEmailReCheck: boolean;
    requiresPhoneReCheck: boolean;
    daysSinceEmailVerification: number;
    daysSincePhoneVerification: number;
    lastEmailVerification: Date;
    lastPhoneVerification: Date;
}

interface ActivityResult {
    isUnusual: boolean;
    reason?: string;
    message: string;
    distance?: string;
    timeDiff?: string;
    currentLocation?: string;
    previousLocation?: string;
    requiresVerification?: boolean;
}

interface LocationResult {
    isSuspicious: boolean;
    isNewCountry?: boolean;
    isNewCity?: boolean;
    location?: { country: string; city: string; region: string };
    message: string;
    requiresVerification?: boolean;
}

class ComplianceService {

    static async check90DayPasswordCompliance(userId: string): Promise<ComplianceStatus> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('passwordChangedAt createdAt').lean().exec();
            if (!user) throw new Error('User not found');

            const lastChange = (user as any).passwordChangedAt || (user as any).createdAt;
            const daysSinceChange = Math.floor((Date.now() - new Date(lastChange).getTime()) / (1000 * 60 * 60 * 24));
            const requiresReVerification = daysSinceChange >= 90;

            return {
                requiresReVerification,
                daysSinceChange,
                lastPasswordChange: lastChange,
                nextRequiredChange: requiresReVerification
                    ? 'Now'
                    : new Date(new Date(lastChange).getTime() + 90 * 24 * 60 * 60 * 1000),
            };
        } catch (error: unknown) {
            LoggerUtil.error('90-day compliance check failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async enforce90DayPasswordReVerification(userId: string, password: string): Promise<{ success: boolean; message: string; requiresReVerification: boolean }> {
        const correlationId = uuidv4();
        try {
            const compliance = await this.check90DayPasswordCompliance(userId);
            if (!compliance.requiresReVerification) {
                return { success: true, message: 'No re-verification required', requiresReVerification: false };
            }

            const user = await User.findOne({ userId }).select('+passwordHash');
            if (!user) throw new Error('User not found');

            const bcrypt = await import('bcrypt');
            const isValid = await bcrypt.compare(password, (user as any).passwordHash);

            if (!isValid) {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId, action: '90DAY_PASSWORD_REVERIFICATION_FAILED', ipAddress: '0.0.0.0',
                    status: Constants.AUDIT_STATUS.FAILURE as 'FAILURE', 
                    severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                    timestamp: new Date().toISOString(), metadata: { correlationId },
                });
                throw new Error('Invalid password');
            }

            (user as any).passwordChangedAt = new Date();
            await (user as any).save();

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: '90DAY_PASSWORD_REVERIFIED', ipAddress: '0.0.0.0',
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', 
                severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: { correlationId },
            });

            return { success: true, message: 'Password re-verified successfully', requiresReVerification: false };
        } catch (error: unknown) {
            LoggerUtil.error('90-day password re-verification failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async checkAnnualIdentityCompliance(userId: string): Promise<AnnualIdentityStatus> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('emailVerifiedAt phoneVerifiedAt createdAt').lean().exec();
            if (!user) throw new Error('User not found');

            const lastEmailVerification = (user as any).emailVerifiedAt || (user as any).createdAt;
            const lastPhoneVerification = (user as any).phoneVerifiedAt || (user as any).createdAt;
            const daysSinceEmailVerification = Math.floor((Date.now() - new Date(lastEmailVerification).getTime()) / (1000 * 60 * 60 * 24));
            const daysSincePhoneVerification = Math.floor((Date.now() - new Date(lastPhoneVerification).getTime()) / (1000 * 60 * 60 * 24));

            return {
                requiresIdentityReCheck: daysSinceEmailVerification >= 365 || daysSincePhoneVerification >= 365,
                requiresEmailReCheck: daysSinceEmailVerification >= 365,
                requiresPhoneReCheck: daysSincePhoneVerification >= 365,
                daysSinceEmailVerification,
                daysSincePhoneVerification,
                lastEmailVerification,
                lastPhoneVerification,
            };
        } catch (error: unknown) {
            LoggerUtil.error('Annual identity compliance check failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async sendAnnualIdentityReCheckOTP(userId: string, verificationType: string, ipAddress: string): Promise<{ success: boolean; message: string; expiresAt: Date; expiresIn: number }> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email phoneNumber firstName').lean().exec();
            if (!user) throw new Error('User not found');

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId,
                otpType: `annual_${verificationType}_recheck`,
                email: verificationType === 'email' ? (user as any).email : undefined,
                phoneNumber: verificationType === 'phone' ? (user as any).phoneNumber : undefined,
                expiryMinutes: 15,
                maxAttempts: 3,
                metadata: { ipAddress, compliance: 'annual_identity_recheck' },
            });

            if (verificationType === 'email') {
                await NotificationService.sendEmail({
                    to: (user as any).email,
                    subject: 'Annual Identity Verification Required',
                    template: 'annual-identity-recheck',
                    data: { otp, expiryMinutes: 15, userName: (user as any).firstName || (user as any).email, verificationType: 'email' },
                });
            } else if (verificationType === 'phone') {
                await NotificationService.sendSMS({
                    to: (user as any).phoneNumber,
                    message: `Your annual identity verification code is: ${otp}. Valid for 15 minutes.`,
                });
            }

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'ANNUAL_IDENTITY_RECHECK_OTP_SENT', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.MEDIUM as 'MEDIUM',
                timestamp: new Date().toISOString(), metadata: { verificationType, correlationId },
            });

            return { success: true, message: `Verification code sent to your ${verificationType}`, expiresAt: (otpRecord as any).expiresAt, expiresIn: 900 };
        } catch (error: unknown) {
            LoggerUtil.error('Send annual identity re-check OTP failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async verifyAnnualIdentityReCheckOTP(userId: string, otp: string, verificationType: string, ipAddress: string): Promise<{ success: boolean; message: string; verifiedAt: string }> {
        const correlationId = uuidv4();
        try {
            await OTPVerification.verifyOTPByType(userId, otp, `annual_${verificationType}_recheck`);

            const updateField = verificationType === 'email' ? 'emailVerifiedAt' : 'phoneVerifiedAt';
            await User.findOneAndUpdate({ userId }, { $set: { [updateField]: new Date() } });

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'ANNUAL_IDENTITY_RECHECKED', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: { verificationType, correlationId },
            });

            return { success: true, message: `${verificationType} re-verified successfully`, verifiedAt: new Date().toISOString() };
        } catch (error: unknown) {
            LoggerUtil.error('Annual identity re-check verification failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async detectUnusualActivity(userId: string, currentIp: string, userAgent: string): Promise<ActivityResult> {
        const correlationId = uuidv4();
        try {
            const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
            const recentSessions = await Session.find({ userId, createdAt: { $gte: fiveHoursAgo }, isActive: true })
                .sort({ createdAt: -1 }).limit(10).lean().exec();

            if (recentSessions.length === 0) return { isUnusual: false, message: 'No recent activity to compare' };

            const currentLocation = geoip.lookup(currentIp);
            if (!currentLocation) return { isUnusual: false, message: 'Location data unavailable' };

            for (const session of recentSessions) {
                const sessionLocation = geoip.lookup((session as any).ipAddress);
                if (!sessionLocation) continue;

                const distance = this.calculateDistance(currentLocation.ll[0], currentLocation.ll[1], sessionLocation.ll[0], sessionLocation.ll[1]);
                const timeDiff = (Date.now() - new Date((session as any).createdAt).getTime()) / (1000 * 60 * 60);

                if (distance > 300 && timeDiff < 5) {
                    await AuditProducer.sendAuditEvent({
                        eventId: uuidv4(), userId, action: 'UNUSUAL_ACTIVITY_DETECTED', ipAddress: currentIp,
                        status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                        timestamp: new Date().toISOString(),
                        metadata: { reason: 'impossible_travel', distance: `${distance.toFixed(2)}km`, timeDiff: `${timeDiff.toFixed(2)}hours`, correlationId },
                    });

                    return {
                        isUnusual: true, reason: 'impossible_travel', message: 'Unusual location change detected',
                        distance: `${distance.toFixed(2)} km`, timeDiff: `${timeDiff.toFixed(2)} hours`,
                        currentLocation: currentLocation.city || currentLocation.country,
                        previousLocation: sessionLocation.city || sessionLocation.country,
                        requiresVerification: true,
                    };
                }
            }

            return { isUnusual: false, message: 'Activity appears normal' };
        } catch (error: unknown) {
            LoggerUtil.error('Unusual activity detection failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async sendUnusualActivityVerification(userId: string, activityDetails: any, ipAddress: string): Promise<{ success: boolean; message: string; expiresAt: Date; expiresIn: number }> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email firstName').lean().exec();
            if (!user) throw new Error('User not found');

            const { otp, otpRecord } = await OTPVerification.createOTP({
                userId, otpType: 'unusual_activity_verification', email: (user as any).email,
                expiryMinutes: 10, maxAttempts: 3, metadata: { ipAddress, activityDetails },
            });

            await NotificationService.sendEmail({
                to: (user as any).email,
                subject: 'Unusual Activity Detected - Was This You?',
                template: 'unusual-activity-alert',
                data: { otp, userName: (user as any).firstName || (user as any).email, activityDetails, ipAddress, timestamp: new Date().toLocaleString(), expiryMinutes: 10 },
            });

            return { success: true, message: 'Verification code sent to your email', expiresAt: (otpRecord as any).expiresAt, expiresIn: 600 };
        } catch (error: unknown) {
            LoggerUtil.error('Send unusual activity verification failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async checkSuspiciousLocation(userId: string, currentIp: string): Promise<LocationResult> {
        const correlationId = uuidv4();
        try {
            const currentLocation = geoip.lookup(currentIp);
            if (!currentLocation) return { isSuspicious: false, message: 'Location data unavailable' };

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const knownSessions = await Session.find({ userId, createdAt: { $gte: thirtyDaysAgo } })
                .select('ipAddress').lean().exec();

            const knownCountries = new Set<string>();
            const knownCities = new Set<string>();

            for (const session of knownSessions) {
                const loc = geoip.lookup((session as any).ipAddress);
                if (loc) {
                    knownCountries.add(loc.country);
                    if (loc.city) knownCities.add(loc.city);
                }
            }

            const isNewCountry = !knownCountries.has(currentLocation.country);
            const isNewCity = !!(currentLocation.city && !knownCities.has(currentLocation.city));

            if (isNewCountry || isNewCity) {
                await AuditProducer.sendAuditEvent({
                    eventId: uuidv4(), userId, action: 'SUSPICIOUS_LOCATION_DETECTED', ipAddress: currentIp,
                    status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.HIGH as 'HIGH',
                    timestamp: new Date().toISOString(),
                    metadata: { country: currentLocation.country, city: currentLocation.city, isNewCountry, isNewCity, correlationId },
                });

                return {
                    isSuspicious: true, isNewCountry, isNewCity,
                    location: { country: currentLocation.country, city: currentLocation.city, region: currentLocation.region },
                    message: `New login from ${currentLocation.city || currentLocation.country}`,
                    requiresVerification: true,
                };
            }

            return { isSuspicious: false, message: 'Login from known location' };
        } catch (error: unknown) {
            LoggerUtil.error('Suspicious location check failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async sendSuspiciousLocationVerification(userId: string, locationDetails: any, ipAddress: string): Promise<{ success: boolean; message: string; verificationLink: string }> {
        const correlationId = uuidv4();
        try {
            const user = await User.findOne({ userId }).select('email firstName').lean().exec();
            if (!user) throw new Error('User not found');

            const verificationToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

            await CacheUtil.set(`suspicious_location:${hashedToken}`, JSON.stringify({ userId, ipAddress, locationDetails }), 1800);

            const verificationLink = `${process.env.FRONTEND_URL}/verify-location/${verificationToken}`;

            await NotificationService.sendEmail({
                to: (user as any).email,
                subject: 'New Location Login - Was This You?',
                template: 'suspicious-location-alert',
                data: { userName: (user as any).firstName || (user as any).email, locationDetails, ipAddress, timestamp: new Date().toLocaleString(), verificationLink },
            });

            return { success: true, message: 'Verification email sent', verificationLink };
        } catch (error: unknown) {
            LoggerUtil.error('Send suspicious location verification failed', { error: (error as Error).message, userId, correlationId });
            throw error;
        }
    }

    static async verifySuspiciousLocation(verificationToken: string): Promise<{ success: boolean; message: string; userId: string }> {
        const correlationId = uuidv4();
        try {
            const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
            const cachedData = await CacheUtil.get(`suspicious_location:${hashedToken}`) as string | null;

            if (!cachedData) throw new Error('Invalid or expired verification link');

            const { userId, ipAddress, locationDetails } = JSON.parse(cachedData);

            await CacheUtil.set(`location_verified:${userId}:${ipAddress}`, 'true', 30 * 24 * 60 * 60);
            await CacheUtil.del(`suspicious_location:${hashedToken}`);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(), userId, action: 'SUSPICIOUS_LOCATION_VERIFIED', ipAddress,
                status: Constants.AUDIT_STATUS.SUCCESS as 'SUCCESS', severity: Constants.AUDIT_SEVERITIES.LOW as 'LOW',
                timestamp: new Date().toISOString(), metadata: { locationDetails, correlationId },
            });

            return { success: true, message: 'Location verified successfully', userId };
        } catch (error: unknown) {
            LoggerUtil.error('Suspicious location verification failed', { error: (error as Error).message, correlationId });
            throw error;
        }
    }

    private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

export default ComplianceService;