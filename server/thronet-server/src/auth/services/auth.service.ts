/**
 * auth.service.ts
 * Business logic only — all DB/cache access via repositories,
 * all types via interfaces/types files.
 *
 * Changes from original:
 * 1. Types & interfaces moved to auth.types.ts / auth.interfaces.ts
 * 2. DB + cache calls moved to auth.repository.ts
 * 3. Only business logic remains here
 */

import bcrypt from 'bcrypt';
import validator from 'validator';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

import logger, { LoggerUtil } from '@/shared/logger.util.js';
import userEmitter from '@/shared/events/emitters/user.emitter.js';
import Constants from '@/shared/constants.util.js';
import AuditProducer from '@/shared/kafka/producers/audit.producer';
import NotificationService from './notification.service';
import { User, ProfilePhoto, CoverPhoto, Headline, Experience, Education } from '@/shared/models/index.models';

import {
    UserRepository,
    LoginAttemptRepository,
    SessionRepository,
    DeviceRepository,
    UserProfileRepository,
    AuditLogRepository,
    AuthCacheRepository,
} from '../repository/auth.repository';

import {
    DeviceData,
    ProfileData,
    LoginResult,
    RegisterResult,
    LogoutResult,
    LogoutAllResult,
    RefreshResult,
    ProfileOptions,
    GetAllUsersParams,
    GetAllUsersResult,
    ProfileUpdates,
    UserForVerification,
    EmailTokenResult,
    EmailVerificationResult,
    EmailVerificationTokenData,
    RateLimitResult,
    GitHubProfile,
} from '../interfaces/auth.interfaces';

import { VerificationType } from '../types/auth.types';

// ==================== AUTH SERVICE ====================

class AuthService {

    /**
     * Check if account is locked (IP or user+IP based)
     */
    static async checkAccountLocked(
        email: string,
        ipAddress: string
    ): Promise<boolean> {
        try {
            // 1. Check IP-level block
            const ipAttempts = await LoginAttemptRepository.countRecentByIp(ipAddress);
            if (ipAttempts >= 3) {
                logger.warn('IP blocked after 3 attempts', { ipAddress });
                return true;
            }

            // 2. Check user-level
            const user = await User.findOne({ email }).select(
                'userId accountStatus lockUntil'
            );
            if (!user) return false;

            if (user.accountStatus === 'locked') {
                logger.warn('Account locked', { userId: user.userId, email });
                return true;
            }

            if (user.lockUntil && user.lockUntil > new Date()) {
                logger.warn('Account temporarily locked', {
                    userId: user.userId,
                    email,
                });
                return true;
            }

            const userAttempts = await LoginAttemptRepository.countRecentByUserAndIp(
                user.userId,
                ipAddress
            );
            return userAttempts >= 3;

        } catch (error: any) {
            logger.error('Account lock check failed', {
                error: error.message,
                email,
            });
            return false;
        }
    }

    // ==================== REGISTER ====================

    static async register(
        email: string,
        password: string,
        profileData: ProfileData = {
            firstName: '',
            location: '',
            userType: 'working',
        },
        deviceData: DeviceData = {}
    ): Promise<RegisterResult> {
        try {
            if (!validator.isEmail(email)) throw new Error('Invalid email format');
            if (password.length < 8)
                throw new Error('Password must be at least 8 characters');

            const existingUser = await UserRepository.findByEmail(email);
            if (existingUser) {
                await AuditLogRepository.logAction({
                    userId: existingUser.userId,
                    userEmail: email,
                    action: 'REGISTRATION_FAILED',
                    ipAddress: deviceData.ipAddress || '0.0.0.0',
                    status: 'FAILURE',
                    severity: 'LOW',
                    metadata: new Map([
                        ['email', email],
                        ['reason', 'user_already_exists'],
                    ]),
                });
                throw new Error(
                    'User already exists, please login instead or create account with a different email.'
                );
            }

            // Build user document
            const user = new User({
                email,
                passwordHash: password,
                phoneNumber: profileData.phoneNumber,
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                location: profileData.location,
                metadata: {
                    registrationIp: deviceData.ipAddress,
                    registrationDevice: deviceData.deviceName,
                    registrationLocation: profileData.location,
                },
                onboarding: {
                    userType: profileData.userType,
                    completedAt: new Date(),

                    ...(profileData.userType === 'working' && {
                        workingProfile: {
                            jobTitle: profileData.jobTitle,
                            companyName: profileData.companyName,
                            startDate: profileData.startDate
                                ? new Date(profileData.startDate)
                                : undefined,
                            endDate: profileData.endDate
                                ? new Date(profileData.endDate)
                                : undefined,
                        },
                    }),

                    ...(profileData.userType === 'student' && {
                        studentProfile: {
                            collegeName: profileData.collegeName,
                            degree: profileData.degree,
                            fieldOfStudy: profileData.fieldOfStudy,
                            graduationYear: profileData.graduationYear,
                        },
                    }),

                    ...(profileData.userType === 'fresher' && {
                        fresherProfile: {
                            highestEducation: profileData.highestEducation,
                            preferredRole: profileData.preferredRole,
                            cgpa: profileData.cgpa,
                        },
                    }),
                },
            });

            logger.info('Creating new user', {
                email,
                firstName: profileData.firstName,
                location: profileData.location,
                userType: profileData.userType,
            });

            await user.save();

            // Generate username
            const username =
                email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_') +
                '_' +
                Date.now().toString().slice(-6);

            const displayName =
                profileData.displayName ||
                (profileData.firstName && profileData.lastName
                    ? `${profileData.firstName} ${profileData.lastName}`
                    : username);

            // Create user profile
            await UserProfileRepository.create({
                userId: user.userId,
                username,
                displayName,
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                location: {
                    city: profileData.location,
                    country: 'India',
                    timezone: 'Asia/Kolkata',
                },
            });

            // Register device
            const device = await DeviceRepository.registerDevice(user.userId, {
                deviceType: deviceData.deviceType || 'desktop',
                deviceName: deviceData.deviceName || 'Unknown Device',
                os: deviceData.os || 'Unknown',
                browser: deviceData.browser || 'Unknown',
                userAgent: deviceData.userAgent || 'Unknown',
            });

            // Create session
            const session = await SessionRepository.createSession({
                userId: user.userId,
                ipAddress: deviceData.ipAddress || '0.0.0.0',
                deviceId: device.deviceId,
                sessionType: 'web',
                deviceInfo: {
                    userAgent: deviceData.userAgent,
                    browser: deviceData.browser,
                    os: deviceData.os,
                },
            });

            // Audit log
            await AuditLogRepository.logAction({
                userId: user.userId,
                userEmail: email,
                action: 'USER_REGISTERED',
                ipAddress: deviceData.ipAddress || '0.0.0.0',
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map([
                    ['email', email],
                    ['firstName', user.firstName],
                    ['location', user.location],
                    ['userType', user.onboarding?.userType],
                    ['phoneNumber', user.phoneNumber],
                    ['deviceId', device.deviceId],
                ]),
            });

            // Emit event
            userEmitter.emit('user:registered', {
                userId: user.userId,
                email,
                firstName: profileData.firstName,
                lastName: profileData.lastName,
                location: profileData.location,
                userType: profileData.userType,
                timestamp: new Date(),
            });

            return {
                userId: user.userId,
                email,
                role: user.role || 'user',
                sessionId: session._id,
                deviceId: device.deviceId,
            };

        } catch (error: any) {
            logger.error('User registration failed', {
                error: error.message,
                email,
            });
            throw error;
        }
    }

    // ==================== LOGIN ====================

    static async login(
        email: string,
        password: string,
        ipAddress: string,
        deviceData: DeviceData = {}
    ): Promise<LoginResult> {
        let userId: string | null = null;

        try {
            logger.info('Login process started', { email, ipAddress });

            // Step 1: Find user
            const user = await UserRepository.findByEmailWithPassword(email);
            if (!user) {
                logger.warn('Login failed: User not found', { email });
                await LoginAttemptRepository.recordSafe(null, ipAddress, 'login', 'failed', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'invalid_credentials',
                    metadata: { email, reason: 'user_not_found' },
                });
                throw new Error('Invalid credentials');
            }

            userId = user.userId;
            logger.debug('User found', { userId, email });

            // Step 2: Account status checks
            if (user.accountStatus === 'locked') {
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'account_locked',
                    metadata: { reason: 'account_locked' },
                });
                throw new Error('Account is locked. Contact support.');
            }

            if (user.accountStatus === 'disabled') {
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'account_disabled',
                    metadata: { reason: 'account_disabled' },
                });
                throw new Error('Account is disabled. Contact support.');
            }

            // Step 3: Rate limit check (3 attempts / 15 min)
            const recentAttempts =
                await LoginAttemptRepository.countRecentByUserAndIp(
                    user.userId,
                    ipAddress
                );

            if (recentAttempts >= 3) {
                logger.warn('Login blocked: Too many attempts', {
                    userId,
                    attempts: recentAttempts,
                });
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'rate_limited',
                    metadata: { attempts: recentAttempts },
                });
                await User.lockAccount(user.userId, 'too_many_attempts');
                throw new Error('Account locked after 3 failed attempts');
            }

            // Step 4: Password verification
            if (!user.passwordHash) {
                throw new Error('Invalid credentials');
            }

            const isPasswordValid = await bcrypt.compare(
                password,
                user.passwordHash
            );

            if (!isPasswordValid) {
                logger.warn('Login failed: Invalid password', { userId });
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'failed', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'invalid_credentials',
                    metadata: { reason: 'wrong_password' },
                });
                throw new Error('Invalid credentials');
            }

            logger.info('Password verified successfully', { userId });

            // Step 5: Update last login
            await user.updateLastLogin(ipAddress);

            // Step 6: Register device
            const device = await DeviceRepository.registerDevice(
                user.userId,
                deviceData
            );

            // Step 7: Create session
            const session = await SessionRepository.createSession({
                userId: user.userId,
                ipAddress,
                deviceId: device.deviceId,
                sessionType: 'web',
            });

            logger.info('Session created', { userId, sessionId: session._id });

            // Step 8: Record success
            await LoginAttemptRepository.recordSafe(
                userId,
                ipAddress,
                'login',
                'success',
                {
                    userAgent: deviceData.userAgent,
                    deviceId: device.deviceId,
                    sessionId: session._id,
                    metadata: { loginTime: new Date() },
                }
            );

            logger.info('Login successful', { userId, sessionId: session._id });

            return {
                userId: user.userId,
                sessionId: session._id,
                deviceId: device.deviceId,
            };

        } catch (error: any) {
            logger.error('Login failed', {
                error: error.message,
                email,
                userId: userId || 'unknown',
            });
            throw error;
        }
    }

    // ==================== GITHUB OAUTH ====================

    static async authenticateWithGitHub(
        githubProfile: GitHubProfile,
        accessToken: string,
        refreshToken: string,
        ipAddress: string,
        deviceData: DeviceData = {}
    ): Promise<RegisterResult> {
        try {
            const githubId = githubProfile.id;
            const githubUsername = githubProfile.username;

            let email =
                githubProfile.emails?.find((e) => e.primary)?.value ||
                githubProfile.emails?.[0]?.value;

            if (!email) {
                throw new Error('No email found in GitHub profile');
            }

            logger.info('GitHub OAuth authentication started', {
                githubId,
                email,
                username: githubUsername,
            });

            let user = await UserRepository.findByEmailOrOAuth(
                email,
                'github',
                githubId
            );

            // Existing user — link GitHub if not already linked
            if (user) {
                const githubLinked = user.oauthProviders?.some(
                    (p: any) => p.provider === 'github' && p.providerId === githubId
                );

                if (!githubLinked) {
                    user.oauthProviders = user.oauthProviders || [];
                    user.oauthProviders.push({
                        provider: 'github',
                        providerId: githubId,
                        accessToken,
                        refreshToken,
                        connectedAt: new Date(),
                    });
                    await user.save();
                    logger.info('GitHub account linked to existing user', {
                        userId: user.userId,
                        email,
                    });
                }

                await user.updateLastLogin(ipAddress);

            } else {
                // New user via GitHub OAuth
                logger.info('Creating new user from GitHub OAuth', {
                    email,
                    githubId,
                });

                const fullName =
                    githubProfile.displayName ||
                    githubProfile.name ||
                    githubUsername;
                const [firstName, ...lastNameParts] = fullName.split(' ');
                const lastName = lastNameParts.join(' ') || undefined;

                const username = await this.generateUniqueUsername(
                    githubUsername || email.split('@')[0]
                );

                user = new User({
                    email: email.toLowerCase(),
                    username,
                    firstName: firstName || githubUsername,
                    lastName,
                    location: githubProfile.location || 'Not specified',
                    emailVerified: true,
                    emailVerifiedAt: new Date(),
                    onboarding: {
                        userType: 'fresher',
                        completedAt: new Date(),
                        fresherProfile: {
                            highestEducation: 'Not specified',
                            preferredRole: 'Not specified',
                        },
                    },
                    oauthProviders: [
                        {
                            provider: 'github',
                            providerId: githubId,
                            accessToken,
                            refreshToken,
                            connectedAt: new Date(),
                        },
                    ],
                    metadata: {
                        registrationIp: ipAddress,
                        registrationDevice: deviceData.deviceName,
                        registrationLocation: githubProfile.location,
                    },
                });

                await user.save();
                logger.info('New user created via GitHub OAuth', {
                    userId: user.userId,
                    email,
                });

                await UserProfileRepository.create({
                    userId: user.userId,
                    username,
                    displayName: fullName,
                    firstName: firstName || githubUsername,
                    lastName,
                    bio: githubProfile.bio,
                    avatar: {
                        url:
                            githubProfile.photos?.[0]?.value ||
                            githubProfile.avatar_url,
                    },
                    social: { github: githubProfile.html_url },
                    location: {
                        city: githubProfile.location || 'Unknown',
                        country: 'Unknown',
                    },
                });

                userEmitter.emit('user:registered', {
                    userId: user.userId,
                    email,
                    registrationMethod: 'github_oauth',
                    timestamp: new Date(),
                });
            }

            // Device + Session
            const device = await DeviceRepository.registerDevice(user.userId, {
                deviceType: deviceData.deviceType || 'desktop',
                deviceName: deviceData.deviceName || 'GitHub OAuth Device',
                os: deviceData.os || 'Unknown',
                browser: deviceData.browser || 'Unknown',
                userAgent: deviceData.userAgent || 'Unknown',
            });

            const session = await SessionRepository.createSession({
                userId: user.userId,
                ipAddress,
                deviceId: device.deviceId,
                sessionType: 'web',
                deviceInfo: {
                    userAgent: deviceData.userAgent,
                    browser: deviceData.browser,
                    os: deviceData.os,
                },
            });

            await LoginAttemptRepository.recordSafe(
                user.userId,
                ipAddress,
                'login',
                'success',
                {
                    userAgent: deviceData.userAgent,
                    deviceId: device.deviceId,
                    sessionId: session._id,
                    metadata: { loginMethod: 'github_oauth' },
                }
            );

            await AuditLogRepository.logAction({
                userId: user.userId,
                userEmail: user.email,
                action: 'USER_LOGIN',
                ipAddress,
                status: 'SUCCESS',
                severity: 'LOW',
                metadata: new Map([
                    ['loginMethod', 'github_oauth'],
                    ['githubId', githubId],
                    ['deviceId', device.deviceId],
                ]),
            });

            logger.info('GitHub OAuth authentication successful', {
                userId: user.userId,
                sessionId: session._id,
            });

            return {
                userId: user.userId,
                email: user.email,
                role: user.role || 'user',
                sessionId: session._id,
                deviceId: device.deviceId,
            };

        } catch (error: any) {
            logger.error('GitHub OAuth authentication failed', {
                error: error.message,
                stack: error.stack,
            });
            throw error;
        }
    }

    /**
     * Generate unique username (helper)
     */
    private static async generateUniqueUsername(base: string): Promise<string> {
        const cleanBase = base.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        let username = cleanBase;
        let counter = 1;

        while (await UserRepository.usernameExists(username)) {
            username = `${cleanBase}_${counter}`;
            counter++;
        }

        return username;
    }

    // ==================== GET USER PROFILE ====================

    static async getUserProfile(
        userId: string,
        options: ProfileOptions = {}
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user profile', { userId, correlationId });

            // L1: Cache
            const cached = await AuthCacheRepository.getCachedProfile(userId);
            if (cached) {
                LoggerUtil.debug('User profile cache HIT', { userId, correlationId });
                return {
                    ...cached,
                    _meta: {
                        source: 'cache',
                        timestamp: new Date().toISOString(),
                        correlationId,
                    },
                };
            }

            // L2: DB
            const user = await UserRepository.findByUserIdForProfile(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const profile = this.buildProfileResponse(user);

            // ✅ Resolve active profile photo, cover photo, and headline
            try {
                const [activePhoto, activeCover, activeHeadline] = await Promise.all([
                    ProfilePhoto.findOne({ userId, isActive: true, isDeleted: false }).lean().exec(),
                    CoverPhoto.findOne({ userId, isActive: true, isDeleted: false }).lean().exec(),
                    Headline.findOne({ userId, 'flags.isDeleted': false }).sort({ createdAt: -1 }).lean().exec()
                ]);
                profile.profileImage = activePhoto ? activePhoto.cloudinarySecureUrl : null;
                profile.coverImage = activeCover ? activeCover.cloudinarySecureUrl : null;
                profile.headline = activeHeadline ? activeHeadline.title : null;
            } catch (err: any) {
                LoggerUtil.warn('Failed to resolve profile/cover photo URLs or headline', {
                    error: err.message,
                    userId
                });
            }

            // ✅ Populate full experienceList & educationList so frontend doesn't need N+1 individual fetches
            // This replaces the old pattern where frontend received only experienceIds[]
            // and had to call GET /get-experience/:id for each one (causing rate-limit issues)
            try {
                const [experienceList, educationList] = await Promise.all([
                    Experience.find({
                        userId,
                        'flags.isDeleted': false,
                        'flags.isArchived': false
                    }).sort({ startDate: -1 }).lean().exec(),
                    Education.find({
                        userId,
                        'flags.isDeleted': false,
                        'flags.isArchived': false
                    }).sort({ startDate: -1 }).lean().exec()
                ]);
                profile.experienceList = experienceList || [];
                profile.educationList = educationList || [];
            } catch (err: any) {
                LoggerUtil.warn('Failed to populate experienceList/educationList', {
                    error: err.message,
                    userId
                });
                // Fallback: frontend will use experienceIds to fetch individually
                profile.experienceList = [];
                profile.educationList = [];
            }

            // Optional stats
            if (options.includeStats) {
                const [activeSessions, activeDevices] = await Promise.all([
                    SessionRepository.countActive(userId),
                    DeviceRepository.countActive(userId),
                ]);
                profile.stats = {
                    activeSessions,
                    activeDevices,
                    accountAge: Math.floor(
                        (Date.now() - new Date(user.createdAt).getTime()) /
                        (1000 * 60 * 60 * 24)
                    ),
                };
            }

            if (options.includeSessions) {
                profile.activeSessions =
                    await SessionRepository.findRecentForProfile(userId);
            }

            // Cache it
            await AuthCacheRepository.setCachedProfile(userId, profile);

            LoggerUtil.info('User profile fetched successfully', {
                userId,
                source: 'database',
                correlationId,
            });

            return {
                ...profile,
                _meta: {
                    source: 'database',
                    timestamp: new Date().toISOString(),
                    correlationId,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Failed to fetch user profile', {
                error: error.message,
                userId,
                correlationId,
            });
            throw new Error(error.message || 'Failed to fetch user profile');
        }
    }

    // ==================== GET USER BY ID ====================

    static async getUserById(
        userId: string,
        options: ProfileOptions = {}
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user by ID', { userId, correlationId });

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            const objectIdRegex = /^[0-9a-fA-F]{24}$/;
            if (!uuidRegex.test(userId) && !objectIdRegex.test(userId)) {
                throw new Error('Invalid user ID format');
            }

            // L1: Cache
            const cached = await AuthCacheRepository.getCachedUser(userId);
            if (cached) {
                LoggerUtil.debug('User cache HIT', { userId, correlationId });
                return {
                    ...cached,
                    _meta: {
                        source: 'cache',
                        timestamp: new Date().toISOString(),
                        correlationId,
                    },
                };
            }

            // L2: DB
            const user = await UserRepository.findByUserId(userId);
            if (!user) throw new Error('User not found');

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            const userResponse = this.buildProfileResponse(user);

            try {
                const activePhoto = await ProfilePhoto.findOne({ userId, isActive: true, isDeleted: false }).lean().exec();
                if (activePhoto) {
                    userResponse.profileImage = activePhoto.cloudinarySecureUrl;
                }
            } catch (err: any) {
                LoggerUtil.warn('Failed to resolve profile photo URL in getUserById', {
                    error: err.message,
                    userId
                });
            }

            if (options.includeStats) {
                const [activeSessions, activeDevices] = await Promise.all([
                    SessionRepository.countActive(userId),
                    DeviceRepository.countActive(userId),
                ]);
                userResponse.stats = {
                    activeSessions,
                    activeDevices,
                    accountAge: Math.floor(
                        (Date.now() - new Date(user.createdAt).getTime()) /
                        (1000 * 60 * 60 * 24)
                    ),
                };
            }

            if (options.includeSessions) {
                userResponse.activeSessions =
                    await SessionRepository.findRecentForProfile(userId);
            }

            await AuthCacheRepository.setCachedUser(userId, userResponse);

            return {
                ...userResponse,
                _meta: {
                    source: 'database',
                    timestamp: new Date().toISOString(),
                    correlationId,
                },
            };

        } catch (error: any) {
            LoggerUtil.error('Failed to fetch user by ID', {
                error: error.message,
                userId,
                correlationId,
            });
            throw new Error(error.message || 'Failed to fetch user');
        }
    }

    /**
     * Build the common profile response object from a user document
     */
    private static buildProfileResponse(user: any): Record<string, any> {
        return {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            location: user.location,
            coverPhotoId: user.coverPhotoId,
            profilePhotoId: user.profilePhotoId,
            analyticsId: user.analyticsId,
            companyId: user.companyId,
            headlineId: user.headlineId,
            aboutId: user.aboutId,
            experienceIds: user.experienceIds,
            phoneNumber: user.phoneNumber || null,
            activityIds: {
                postIds: user.activityIds?.postIds || [],
                commentIds: user.activityIds?.commentIds || [],
                videoIds: user.activityIds?.videoIds || [],
                imageIds: user.activityIds?.imageIds || [],
                documentIds: user.activityIds?.documentIds || [],
            },
            activityStats: {
                totalPosts: user.activityStats?.totalPosts || 0,
                totalComments: user.activityStats?.totalComments || 0,
                totalVideos: user.activityStats?.totalVideos || 0,
                totalImages: user.activityStats?.totalImages || 0,
                totalDocuments: user.activityStats?.totalDocuments || 0,
            },
            onboarding: this.buildOnboardingSection(user.onboarding),
            role: user.role,
            status: user.status,
            emailVerified: user.emailVerified,
            phoneVerified: user.phoneVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            preferences: user.preferences,
            metadata: {
                totalLogins: user.metadata?.totalLogins || 0,
                lastLoginAt: user.lastLoginAt || null,
                lastLoginIp: user.lastLoginIp || null,
                lastActiveAt: user.metadata?.lastActiveAt || null,
            },
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    /**
     * Build onboarding section based on userType
     */
    private static buildOnboardingSection(onboarding: any): Record<string, any> {
        const base: Record<string, any> = {
            userType: onboarding?.userType || 'unknown',
            completedAt: onboarding?.completedAt || null,
        };

        if (onboarding?.userType === 'working') {
            base.workingProfile = {
                jobTitle: onboarding.workingProfile?.jobTitle || null,
                companyName: onboarding.workingProfile?.companyName || null,
                startDate: onboarding.workingProfile?.startDate || null,
                endDate: onboarding.workingProfile?.endDate || null,
            };
        }

        if (onboarding?.userType === 'student') {
            base.studentProfile = {
                collegeName: onboarding.studentProfile?.collegeName || null,
                degree: onboarding.studentProfile?.degree || null,
                fieldOfStudy: onboarding.studentProfile?.fieldOfStudy || null,
                graduationYear: onboarding.studentProfile?.graduationYear || null,
            };
        }

        if (onboarding?.userType === 'fresher') {
            base.fresherProfile = {
                highestEducation: onboarding.fresherProfile?.highestEducation || null,
                preferredRole: onboarding.fresherProfile?.preferredRole || null,
                cgpa: onboarding.fresherProfile?.cgpa || null,
            };
        }

        return base;
    }

    // ==================== GET ALL USERS ====================

    static async getAllUsers(
        params: GetAllUsersParams
    ): Promise<GetAllUsersResult> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all users', {
                ...params,
                correlationId,
            });

            const { users, total, totalPages } =
                await UserRepository.findAllPaginated(params);

            const userIds = users.map((u: any) => u.userId);
            const activePhotos = await ProfilePhoto.find({
                userId: { $in: userIds },
                isActive: true,
                isDeleted: { $ne: true }
            }).lean().exec();

            const photoMap = new Map();
            activePhotos.forEach((photo: any) => {
                photoMap.set(photo.userId, photo.cloudinarySecureUrl);
            });

            const formattedUsers = users.map((user: any) => ({
                userId: user.userId,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName || null,
                fullName: user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.firstName,
                location: user.location || null,
                userType: user.onboarding?.userType || 'not-set',
                role: user.role,
                status: user.status,
                emailVerified: user.emailVerified,
                phoneVerified: user.phoneVerified,
                phoneNumber: user.phoneNumber
                    ? user.phoneNumber.substring(0, 6) + '****'
                    : null,
                lastLoginAt: user.lastLoginAt || null,
                totalLogins: user.metadata?.totalLogins || 0,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                profileImage: photoMap.get(user.userId) || null,
            }));

            return { users: formattedUsers, total, totalPages };

        } catch (error: any) {
            LoggerUtil.error('Get all users service failed', {
                error: error.message,
                correlationId,
            });
            throw new Error(error.message || 'Failed to fetch users');
        }
    }

    // ==================== UPDATE PROFILE ====================

    static async updateUserProfile(
        userId: string,
        updates: ProfileUpdates,
        ipAddress: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating user profile', {
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const allowedFields = [
                'email', 'password', 'phoneNumber', 'firstName',
                'lastName', 'location', 'onboarding', 'preferences',
            ];

            const updateFields = Object.keys(updates).filter((k) =>
                allowedFields.includes(k)
            );
            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            const currentUser = await UserRepository.findByUserIdWithPassword(userId);
            if (!currentUser) throw new Error('User not found');

            const validatedUpdates: any = {};

            // Email
            if (updates.email !== undefined) {
                const email = updates.email?.trim().toLowerCase();
                if (!email) throw new Error('Email cannot be empty');
                if (!validator.isEmail(email)) throw new Error('Invalid email format');

                const exists = await UserRepository.emailExistsForOtherUser(
                    email,
                    userId
                );
                if (exists) throw new Error('Email already exists');

                validatedUpdates.email = email;
                validatedUpdates.emailVerified = false;
                validatedUpdates.emailVerifiedAt = null;
            }

            // Password
            if (updates.password !== undefined) {
                const password = updates.password?.trim();
                if (!password) throw new Error('Password cannot be empty');
                if (password.length < 8 || password.length > 128) {
                    throw new Error('Password must be 8-128 characters');
                }

                const passwordRegex =
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
                if (!passwordRegex.test(password)) {
                    throw new Error(
                        'Password must contain uppercase, lowercase, number, and special character'
                    );
                }

                const salt = await bcrypt.genSalt(12);
                validatedUpdates.passwordHash = await bcrypt.hash(password, salt);
                validatedUpdates.passwordSalt = salt;
                validatedUpdates.passwordChangedAt = new Date();
            }

            // Phone number
            if (updates.phoneNumber !== undefined) {
                const phoneNumber = updates.phoneNumber?.trim();
                if (phoneNumber && !validator.isMobilePhone(phoneNumber, 'any')) {
                    throw new Error(
                        'Invalid phone number format (use E.164 format, e.g., +919876543210)'
                    );
                }
                validatedUpdates.phoneNumber = phoneNumber || null;
                if (phoneNumber !== currentUser.phoneNumber) {
                    validatedUpdates.phoneVerified = false;
                    validatedUpdates.phoneVerifiedAt = null;
                }
            }

            // First name
            if (updates.firstName !== undefined) {
                const firstName = updates.firstName?.trim();
                if (firstName && (firstName.length < 2 || firstName.length > 50)) {
                    throw new Error('First name must be 2-50 characters');
                }
                if (firstName && !/^[a-zA-Z\s\-']+$/.test(firstName)) {
                    throw new Error(
                        'First name can only contain letters, spaces, hyphens, and apostrophes'
                    );
                }
                validatedUpdates.firstName = firstName || null;
            }

            // Last name
            if (updates.lastName !== undefined) {
                const lastName = updates.lastName?.trim();
                if (lastName && (lastName.length < 2 || lastName.length > 50)) {
                    throw new Error('Last name must be 2-50 characters');
                }
                if (lastName && !/^[a-zA-Z\s\-']+$/.test(lastName)) {
                    throw new Error(
                        'Last name can only contain letters, spaces, hyphens, and apostrophes'
                    );
                }
                validatedUpdates.lastName = lastName || null;
            }

            // Location
            if (updates.location !== undefined) {
                const location = updates.location?.trim();
                if (location && (location.length < 2 || location.length > 50)) {
                    throw new Error('Location must be 2-50 characters');
                }
                if (location && !/^[A-Z][a-zA-Z\s\-]{1,49}$/.test(location)) {
                    throw new Error('Location must start with a capital letter');
                }
                validatedUpdates.location = location || null;
            }

            // Onboarding
            if (updates.onboarding !== undefined) {
                const userType =
                    updates.onboarding.userType || currentUser.onboarding?.userType;

                if (
                    !userType ||
                    !['working', 'student', 'fresher'].includes(userType)
                ) {
                    throw new Error(
                        'Invalid user type. Must be: working, student, or fresher'
                    );
                }

                const onboardingUpdates: any = {
                    userType,
                    completedAt: currentUser.onboarding?.completedAt || new Date(),
                };

                if (userType === 'working' && updates.onboarding.workingProfile) {
                    const wp = updates.onboarding.workingProfile;
                    onboardingUpdates.workingProfile = {
                        jobTitle: wp.jobTitle || currentUser.onboarding?.workingProfile?.jobTitle,
                        companyName: wp.companyName || currentUser.onboarding?.workingProfile?.companyName,
                        startDate: wp.startDate
                            ? new Date(wp.startDate)
                            : currentUser.onboarding?.workingProfile?.startDate,
                        endDate: wp.endDate
                            ? new Date(wp.endDate)
                            : currentUser.onboarding?.workingProfile?.endDate,
                    };
                    if (onboardingUpdates.workingProfile.startDate > new Date()) {
                        throw new Error('Start date cannot be in the future');
                    }
                    if (
                        onboardingUpdates.workingProfile.endDate &&
                        onboardingUpdates.workingProfile.endDate <
                        onboardingUpdates.workingProfile.startDate
                    ) {
                        throw new Error('End date must be after start date');
                    }
                }

                if (userType === 'student' && updates.onboarding.studentProfile) {
                    const sp = updates.onboarding.studentProfile;
                    onboardingUpdates.studentProfile = {
                        collegeName: sp.collegeName || currentUser.onboarding?.studentProfile?.collegeName,
                        degree: sp.degree || currentUser.onboarding?.studentProfile?.degree,
                        fieldOfStudy: sp.fieldOfStudy || currentUser.onboarding?.studentProfile?.fieldOfStudy,
                        graduationYear: sp.graduationYear || currentUser.onboarding?.studentProfile?.graduationYear,
                    };
                    if (onboardingUpdates.studentProfile.graduationYear) {
                        const year = parseInt(onboardingUpdates.studentProfile.graduationYear);
                        const currentYear = new Date().getFullYear();
                        if (year < 1950 || year > currentYear + 10) {
                            throw new Error('Invalid graduation year');
                        }
                    }
                }

                if (userType === 'fresher' && updates.onboarding.fresherProfile) {
                    const fp = updates.onboarding.fresherProfile;
                    onboardingUpdates.fresherProfile = {
                        highestEducation: fp.highestEducation || currentUser.onboarding?.fresherProfile?.highestEducation,
                        preferredRole: fp.preferredRole || currentUser.onboarding?.fresherProfile?.preferredRole,
                        cgpa: fp.cgpa || currentUser.onboarding?.fresherProfile?.cgpa,
                    };
                    if (onboardingUpdates.fresherProfile.cgpa) {
                        if (!/^\d{1,2}\.\d{2}$/.test(onboardingUpdates.fresherProfile.cgpa)) {
                            throw new Error('CGPA must be in format X.XX (e.g., 8.50)');
                        }
                        const cgpaValue = parseFloat(onboardingUpdates.fresherProfile.cgpa);
                        if (cgpaValue < 0 || cgpaValue > 10) {
                            throw new Error('CGPA must be between 0.00 and 10.00');
                        }
                    }
                }

                validatedUpdates.onboarding = onboardingUpdates;
            }

            // Preferences
            if (updates.preferences) {
                validatedUpdates.preferences = {
                    ...currentUser.preferences,
                    ...updates.preferences,
                };
            }

            // Write to DB
            const updatedUser = await UserRepository.updateByUserId(
                userId,
                validatedUpdates
            );
            if (!updatedUser) throw new Error('User not found or update failed');

            // Invalidate caches
            await AuthCacheRepository.invalidateUserCaches(userId);

            // Audit log (non-blocking)
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId,
                    action: 'USER_PROFILE_UPDATED',
                    ipAddress,
                    status: 'SUCCESS',
                    severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        updatedFields: Object.keys(validatedUpdates),
                        hasEmailChange: !!updates.email,
                        hasPasswordChange: !!updates.password,
                        hasPhoneChange: !!updates.phoneNumber,
                        correlationId,
                    },
                }).catch((err: any) =>
                    LoggerUtil.error('Audit log failed', { error: err.message })
                );
            });

            return {
                userId: updatedUser.userId,
                email: updatedUser.email,
                phoneNumber: updatedUser.phoneNumber,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                location: updatedUser.location,
                onboarding: updatedUser.onboarding,
                phoneVerified: updatedUser.phoneVerified,
                emailVerified: updatedUser.emailVerified,
                preferences: updatedUser.preferences,
                updatedAt: updatedUser.updatedAt,
                updatedFields: Object.keys(validatedUpdates),
            };

        } catch (error: any) {
            LoggerUtil.error('Failed to update user profile', {
                error: error.message,
                userId,
                correlationId,
            });
            throw new Error(error.message || 'Failed to update profile');
        }
    }

    // ==================== DEACTIVATE ACCOUNT ====================

    static async deactivateAccount(
        userId: string,
        ipAddress: string,
        reason: string = 'user_requested'
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deactivating account', { userId, reason, correlationId });

            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');
            if (user.status === 'inactive') throw new Error('Account already deactivated');

            user.status = 'inactive';
            user.metadata = user.metadata || {};
            user.metadata.deactivatedAt = new Date();
            user.metadata.deactivationReason = reason;
            user.updatedAt = new Date();
            await user.save();

            await SessionRepository.terminateAllForUser(userId, 'account_deactivated');
            await DeviceRepository.deactivateAllForUser(userId);
            await AuthCacheRepository.invalidateUserCaches(userId);

            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId,
                    action: 'ACCOUNT_DEACTIVATED',
                    ipAddress,
                    status: 'SUCCESS',
                    severity: 'MEDIUM',
                    timestamp: new Date().toISOString(),
                    metadata: { reason, correlationId },
                }).catch((err: any) =>
                    LoggerUtil.error('Audit log failed', { error: err.message })
                );
            });

            return {
                success: true,
                message: 'Account deactivated successfully',
                userId,
                deactivatedAt: user.metadata.deactivatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Failed to deactivate account', {
                error: error.message,
                userId,
                correlationId,
            });
            throw new Error(error.message || 'Failed to deactivate account');
        }
    }

    // ==================== DELETE USER (ADMIN) ====================

    static async deleteUser(
        userId: string,
        adminId: string,
        ipAddress: string,
        reason: string
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.warn('ADMIN DELETE - Permanently deleting user', {
                userId,
                adminId,
                reason,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');

            await UserRepository.deleteByUserId(userId);

            const [deletedSessions, deletedDevices] = await Promise.all([
                SessionRepository.terminateAllForUser(userId, 'user_logout'),
                DeviceRepository.deleteAllForUser(userId),
            ]);

            await AuthCacheRepository.invalidateUserCaches(userId);

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId: adminId,
                action: 'USER_DELETED_BY_ADMIN',
                ipAddress,
                status: 'SUCCESS',
                severity: 'CRITICAL',
                timestamp: new Date().toISOString(),
                metadata: {
                    deletedUserId: userId,
                    deletedEmail: user.email,
                    reason,
                    correlationId,
                },
            });

            return {
                success: true,
                message: 'User deleted permanently',
                deletedUserId: userId,
                deletedEmail: user.email,
                deletedAt: new Date().toISOString(),
            };

        } catch (error: any) {
            LoggerUtil.error('Failed to delete user', {
                error: error.message,
                userId,
                adminId,
                correlationId,
            });

            await AuditProducer.sendAuditEvent({
                eventId: uuidv4(),
                userId: adminId,
                action: 'USER_DELETE_FAILED',
                ipAddress,
                status: 'FAILURE',
                severity: 'CRITICAL',
                timestamp: new Date().toISOString(),
                metadata: {
                    targetUserId: userId,
                    error: error.message,
                    correlationId,
                },
            }).catch((auditErr: any) =>
                LoggerUtil.error('Critical audit log failed', {
                    error: auditErr.message,
                })
            );

            throw new Error(error.message || 'Failed to delete user');
        }
    }

    // ==================== LOGOUT ====================

    static async logout(
        userId: string,
        sessionId: string,
        deviceId: string,
        accessToken: string,
        ipAddress: string,
        correlationId: string
    ): Promise<LogoutResult> {
        try {
            LoggerUtil.info('Logout service started', {
                userId,
                sessionId,
                correlationId,
            });

            // 1. Blacklist access token
            if (accessToken) {
                await AuthCacheRepository.blacklistAccessToken(accessToken);
                const isBlacklisted = await AuthCacheRepository.isBlacklisted(
                    'access',
                    accessToken
                );
                if (!isBlacklisted) {
                    LoggerUtil.warn(
                        'Token blacklist verification failed (cache issue) - proceeding anyway',
                        { userId, correlationId }
                    );
                }
            }

            // 2. Terminate session
            let session: any = null;
            if (sessionId) {
                session = await SessionRepository.findSession(sessionId, userId);
                if (session && session.status !== 'terminated') {
                    session.status = 'terminated';
                    session.terminatedAt = new Date();
                    session.terminationReason = 'user_logout';
                    const refreshToken = session.refreshToken;
                    await session.save();

                    // 3. Blacklist refresh token
                    if (refreshToken) {
                        await AuthCacheRepository.blacklistRefreshToken(refreshToken);
                    }
                }
            }

            // 4. Deactivate device
            if (deviceId) {
                try {
                    await DeviceRepository.deactivateDevice(deviceId, userId);
                } catch (err: any) {
                    LoggerUtil.error('Device update failed (non-critical)', {
                        error: err.message,
                        deviceId,
                        userId,
                        correlationId,
                    });
                }
            }

            // 5. Clear caches
            await AuthCacheRepository.invalidateSessionCache(userId, sessionId);

            // 6. Update last active
            try {
                await UserRepository.updateLastActive(userId);
            } catch (err: any) {
                LoggerUtil.error('User metadata update failed (non-critical)', {
                    error: err.message,
                    userId,
                    correlationId,
                });
            }

            // 7. Audit log
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId,
                    action: Constants.AUDIT_ACTIONS?.USER_LOGOUT || 'USER_LOGOUT',
                    ipAddress,
                    status: 'SUCCESS',
                    severity: 'LOW',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        sessionId,
                        deviceId,
                        tokenBlacklisted: !!accessToken,
                        correlationId,
                    },
                }).catch((err: any) =>
                    LoggerUtil.error('Audit log failed', { error: err.message })
                );
            });

            return {
                success: true,
                message: 'Logged out successfully',
                loggedOut: true,
                loggedOutAt: session?.terminatedAt || new Date(),
                tokenBlacklisted: !!accessToken,
                sessionTerminated: !!session,
                deviceDeactivated: !!deviceId,
            };

        } catch (error: any) {
            LoggerUtil.error('Logout service failed', {
                error: error.message,
                userId,
                sessionId,
                correlationId,
            });
            throw new Error(error.message || 'Logout failed');
        }
    }

    // ==================== LOGOUT ALL ====================

    static async logoutAll(
        userId: string,
        currentAccessToken: string,
        ipAddress: string,
        correlationId: string
    ): Promise<LogoutAllResult> {
        try {
            LoggerUtil.info('Logout all devices service started', {
                userId,
                correlationId,
            });

            let tokensBlacklisted = 0;
            let sessionsTerminated = 0;

            // 1. Blacklist current token
            if (currentAccessToken) {
                await AuthCacheRepository.blacklistAccessToken(currentAccessToken);
                tokensBlacklisted++;
                const isBlacklisted = await AuthCacheRepository.isBlacklisted(
                    'access',
                    currentAccessToken
                );
                if (!isBlacklisted) {
                    throw new Error('Failed to blacklist current token');
                }
            }

            // 2. Find all active sessions
            const activeSessions = await SessionRepository.findAllActive(userId);

            // 3. Terminate each session + blacklist tokens
            for (const session of activeSessions) {
                try {
                    session.status = 'terminated';
                    session.terminatedAt = new Date();
                    session.terminationReason = 'logout_all_devices';
                    await session.save();
                    sessionsTerminated++;

                    if (
                        session.accessToken &&
                        session.accessToken !== currentAccessToken
                    ) {
                        await AuthCacheRepository.blacklistAccessToken(
                            session.accessToken
                        );
                        tokensBlacklisted++;
                    }

                    if (session.refreshToken) {
                        await AuthCacheRepository.blacklistRefreshToken(
                            session.refreshToken
                        );
                        tokensBlacklisted++;
                    }
                } catch (err: any) {
                    LoggerUtil.error('Failed to terminate session (continuing)', {
                        error: err.message,
                        sessionId: session.sessionId,
                        userId,
                        correlationId,
                    });
                }
            }

            // 4. Deactivate all devices
            const devicesDeactivated =
                await DeviceRepository.deactivateAllForUser(userId);

            // 5. Clear caches
            await AuthCacheRepository.invalidateUserCaches(userId);

            // 6. Update last active
            try {
                await UserRepository.updateLastActive(userId);
            } catch (_) { }

            // 7. Audit log
            setImmediate(() => {
                AuditProducer.sendAuditEvent({
                    eventId: uuidv4(),
                    userId,
                    action: 'LOGOUT_ALL_DEVICES',
                    ipAddress,
                    status: 'SUCCESS',
                    severity: 'MEDIUM',
                    timestamp: new Date().toISOString(),
                    metadata: {
                        sessionsTerminated,
                        tokensBlacklisted,
                        devicesDeactivated,
                        correlationId,
                    },
                }).catch((err: any) =>
                    LoggerUtil.error('Audit log failed', { error: err.message })
                );
            });

            return {
                success: true,
                message: 'Logged out from all devices successfully',
                sessionsTerminated,
                tokensBlacklisted,
                devicesDeactivated,
                loggedOutAt: new Date(),
            };

        } catch (error: any) {
            LoggerUtil.error('Logout all devices failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw new Error(error.message || 'Failed to logout from all devices');
        }
    }

    // ==================== REFRESH ACCESS TOKEN ====================

    static async refreshAccessToken(
        refreshToken: string,
        ipAddress: string,
        deviceId: string
    ): Promise<RefreshResult> {
        try {
            const decoded = User.verifyToken(refreshToken, 'refresh');

            const session = await SessionRepository.findSession(
                decoded.sessionId,
                decoded.userId
            );

            if (!session) {
                throw new Error('Session not found or expired');
            }

            const activeDevices = await DeviceRepository.countActive(decoded.userId);
            if (activeDevices > 2) {
                throw new Error('Device limit exceeded (max 2 active devices)');
            }

            await SessionRepository.updateActivity(session._id);

            return {
                sessionId: session._id,
                userId: decoded.userId,
            };

        } catch (error: any) {
            LoggerUtil.error('Token refresh failed', {
                error: error.message,
                ipAddress,
                deviceId,
            });
            throw error;
        }
    }

    // ==================== GET USER FOR VERIFICATION ====================

    static async getUserForVerification(
        userId: string
    ): Promise<UserForVerification | null> {
        try {
            if (!userId) {
                logger.warn('getUserForVerification called without userId');
                return null;
            }

            // Cache check
            const cacheKey = `user:${userId}`;
            const cached = await AuthCacheRepository.get(cacheKey);

            if (cached) {
                const parsed =
                    typeof cached === 'string' ? JSON.parse(cached) : cached;
                if (parsed.status === 'active') return parsed as UserForVerification;
            }

            // DB fallback
            const user = await UserRepository.findForVerification(userId);
            if (!user) return null;

            // Cache result
            try {
                await AuthCacheRepository.set(cacheKey, JSON.stringify(user), 300);
            } catch (_) { }

            return user;

        } catch (error: any) {
            logger.error('Get user for verification failed', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }

    // ==================== VERIFY EMAIL ====================

    static async verifyEmail(
        userId: string,
        tokenHash: string | null = null
    ): Promise<any> {
        try {
            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');

            if (user.emailVerified) {
                LoggerUtil.info('Email already verified', { userId });
                return user;
            }

            user.emailVerified = true;
            user.emailVerificationToken = undefined;
            user.emailVerificationExpires = undefined;
            await user.save();

            await AuthCacheRepository.del(
                `${Constants.CACHE_PREFIXES.USER}${userId}`
            );

            if (tokenHash) {
                await AuthCacheRepository.del(`email_verify_token:${tokenHash}`);
            }

            try {
                userEmitter.emit('user:email_verified', {
                    userId,
                    email: user.email,
                });
            } catch (_) { }

            return user;

        } catch (error: any) {
            LoggerUtil.error('Email verification failed', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }

    // ==================== GENERATE EMAIL VERIFICATION TOKEN ====================

    static async generateEmailVerificationToken(
        userId: string,
        email: string,
        type: VerificationType = 'link'
    ): Promise<EmailVerificationResult> {
        try {
            if (type === 'otp') {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const otpHash = crypto
                    .createHash('sha256')
                    .update(otp)
                    .digest('hex');

                const data: EmailVerificationTokenData = {
                    userId,
                    email,
                    createdAt: Date.now(),
                    type: 'otp',
                };
                await AuthCacheRepository.set(
                    `email_verify_otp:${otpHash}`,
                    JSON.stringify(data),
                    600
                );
                return { otp, expiryMinutes: 10 };
            } else {
                const token = crypto.randomBytes(32).toString('hex');
                const tokenHash = crypto
                    .createHash('sha256')
                    .update(token)
                    .digest('hex');

                const data: EmailVerificationTokenData = {
                    userId,
                    email,
                    createdAt: Date.now(),
                    type: 'link',
                };
                await AuthCacheRepository.set(
                    `email_verify_token:${tokenHash}`,
                    JSON.stringify(data),
                    86400
                );
                return {
                    token,
                    verificationLink: `${process.env.FRONTEND_URL}/verify-email?token=${token}`,
                    expiryHours: 24,
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Token generation failed', {
                error: error.message,
                userId,
                type,
            });
            throw error;
        }
    }

    // ==================== VERIFY EMAIL TOKEN/OTP ====================

    static async verifyEmailToken(
        tokenOrOtp: string,
        type: VerificationType = 'link',
        userId: string | null = null
    ): Promise<EmailTokenResult> {
        try {
            const hash = crypto
                .createHash('sha256')
                .update(tokenOrOtp)
                .digest('hex');

            const cacheKey =
                type === 'otp'
                    ? `email_verify_otp:${hash}`
                    : `email_verify_token:${hash}`;

            const cachedData = await AuthCacheRepository.get(cacheKey);
            if (!cachedData) {
                throw new Error(
                    `Invalid or expired ${type === 'otp' ? 'OTP' : 'token'}`
                );
            }

            const tokenData =
                typeof cachedData === 'string'
                    ? JSON.parse(cachedData)
                    : cachedData;

            if (tokenData.type !== type) {
                throw new Error('Invalid verification type');
            }

            if (
                type === 'otp' &&
                userId &&
                tokenData.userId !== userId
            ) {
                throw new Error('OTP does not belong to this user');
            }

            return {
                userId: tokenData.userId,
                email: tokenData.email,
                tokenHash: hash,
            };

        } catch (error: any) {
            LoggerUtil.error('Token verification failed', {
                error: error.message,
                type,
            });
            throw error;
        }
    }

    // ==================== SEND VERIFICATION EMAIL ====================

    static async sendVerificationEmail(
        email: string,
        firstName: string,
        verificationData: any,
        type: VerificationType = 'link'
    ): Promise<boolean> {
        try {
            const subject =
                type === 'otp'
                    ? 'Your Email Verification Code - Throne8'
                    : 'Verify Your Email Address - Throne8';

            await NotificationService.sendEmail({
                to: email,
                subject,
                template: 'email-otp',
                data: {
                    firstName: firstName || 'User',
                    userEmail: email,
                    ...verificationData,
                },
            });

            LoggerUtil.info('Verification email sent successfully', {
                email,
                type,
            });
            return true;

        } catch (error: any) {
            LoggerUtil.error('Email sending failed', {
                error: error.message,
                email,
                type,
            });
            throw error;
        }
    }

    // ==================== RATE LIMIT ====================

    static async checkRateLimit(
        key: string,
        limit: number = 3,
        ttl: number = 3600
    ): Promise<RateLimitResult> {
        try {
            const attemptCount = await AuthCacheRepository.getRateLimit(key);

            if (attemptCount >= limit) {
                return { allowed: false, remainingAttempts: 0, retryAfter: ttl };
            }

            await AuthCacheRepository.setRateLimit(key, attemptCount + 1, ttl);

            return {
                allowed: true,
                remainingAttempts: limit - (attemptCount + 1),
                attempts: attemptCount + 1,
            };

        } catch (error: any) {
            LoggerUtil.error('Rate limit check failed', {
                error: error.message,
                key,
            });
            throw error;
        }
    }

    static async clearRateLimit(key: string): Promise<boolean> {
        try {
            await AuthCacheRepository.del(key);
            return true;
        } catch (error: any) {
            LoggerUtil.error('Rate limit clear failed', {
                error: error.message,
                key,
            });
            return false;
        }
    }

    // ==================== VERIFY PHONE ====================

    static async verifyPhone(
        userId: string,
        phoneNumber: string
    ): Promise<any> {
        try {
            const user = await User.findOne({ userId });
            if (!user) throw new Error('User not found');

            if (user.phoneVerified) {
                LoggerUtil.info('Phone already verified', { userId });
                return user;
            }

            user.phoneNumber = phoneNumber;
            user.phoneVerified = true;
            user.phoneVerifiedAt = new Date();
            await user.save();

            await AuthCacheRepository.del(
                `${Constants.CACHE_PREFIXES.USER}${userId}`
            );

            try {
                userEmitter.emit('user:phone_verified', { userId, phoneNumber });
            } catch (_) { }

            return user;

        } catch (error: any) {
            LoggerUtil.error('Phone verification failed', {
                error: error.message,
                userId,
            });
            throw error;
        }
    }

    // ==================== CACHE INVALIDATION (public helper) ====================

    static async invalidateUserCache(userId: string): Promise<void> {
        await AuthCacheRepository.invalidateUserCaches(userId);
    }
}

export default AuthService;









// /**
//  * auth.service.ts - FIXED VERSION
//  * All login issues resolved
//  * Changes:
//  * 1. Removed user.comparePassword() - direct bcrypt.compare()
//  * 2. Removed PasswordHistory check from login (only for password change)
//  * 3. Fixed LoginAttempt.recordAttempt() calls with proper error handling
//  * 4. Proper userId handling for anonymous attempts
//  */

// import bcrypt from 'bcrypt';
// import validator from 'validator';
// import { v4 as uuidv4 } from 'uuid';
// import crypto from 'crypto';
// import CacheUtil from '@/shared/cache.util';
// import userEmitter from '@/shared/events/emitters/user.emitter.js';
// import logger, { LoggerUtil } from '@/shared/logger.util.js';
// import {
//     User,
//     UserProfile,
//     Device,
//     Session,
//     AuditLog,
//     LoginAttempt,
// } from '@/shared/models/index.models';
// import Constants from '@/shared/constants.util.js';
// import AuditProducer from '@/shared/kafka/producers/audit.producer';
// import NotificationService from './notification.service';
// // import UserProfile from '@/shared/models/index.models';

// // ==================== INTERFACES ====================

// interface DeviceData {
//     deviceType?: string;
//     deviceName?: string;
//     os?: string;
//     browser?: string;
//     userAgent?: string;
//     ipAddress?: string;
// }

// interface ProfileData {
//     // username?: string;
//     phoneNumber?: string;
//     firstName: string;             // ✅ REQUIRED
//     lastName?: string;
//     location: string;              // ✅ NEW: Required city
//     displayName?: string;
//     userType: 'working' | 'student' | 'fresher';  // ✅ NEW

//     // Working profile
//     jobTitle?: string;
//     companyName?: string;
//     startDate?: string;
//     endDate?: string;

//     // Student profile
//     collegeName?: string;
//     degree?: string;
//     fieldOfStudy?: string;
//     graduationYear?: string;

//     // Fresher profile
//     highestEducation?: string;
//     preferredRole?: string;
//     cgpa?: string;
// }

// interface LoginResult {
//     userId: string;
//     sessionId: string;
//     deviceId: string;
// }

// interface RegisterResult {
//     userId: string;
//     email: string;
//     role: string;
//     sessionId: string;
//     deviceId: string;
// }

// interface ProfileOptions {
//     includeStats?: boolean;
//     includeSessions?: boolean;
// }

// interface GetAllUsersParams {
//     page: number;
//     limit: number;
//     skip: number;
//     filters: {
//         status?: string;
//         role?: string;
//         userType?: string;
//         location?: string;
//         search?: string;
//     };
//     sortBy: string;
// }

// interface GetAllUsersResult {
//     users: any[];
//     total: number;
//     totalPages: number;
// }


// interface ProfileUpdates {
//     // Basic fields
//     email?: string | null;
//     password?: string | null;
//     phoneNumber?: string | null;
//     phoneVerified?: boolean;
//     firstName?: string | null;
//     lastName?: string | null;
//     location?: string | null;

//     // Onboarding updates
//     onboarding?: {
//         userType?: 'working' | 'student' | 'fresher';
//         workingProfile?: {
//             jobTitle?: string;
//             companyName?: string;
//             startDate?: string;
//             endDate?: string;
//         };
//         studentProfile?: {
//             collegeName?: string;
//             degree?: string;
//             fieldOfStudy?: string;
//             graduationYear?: string;
//         };
//         fresherProfile?: {
//             highestEducation?: string;
//             preferredRole?: string;
//             cgpa?: string;
//         };
//     };

//     // Preferences
//     preferences?: Record<string, any>;
// }

// interface LogoutResult {
//     success: boolean;
//     message: string;
//     loggedOut: boolean;
//     loggedOutAt: Date;
//     tokenBlacklisted: boolean;
//     sessionTerminated: boolean;
//     deviceDeactivated: boolean;
// }

// interface LogoutAllResult {
//     [x: string]: any;
//     success: boolean;
//     message: string;
//     sessionsTerminated: number;
//     tokensBlacklisted: number;
//     devicesDeactivated: number;  // ✅ यह same info है
//     loggedOutAt: Date;
// }

// interface RefreshResult {
//     sessionId: string;
//     userId: string;
// }

// interface UserForVerification {
//     userId: string;
//     email: string;
//     emailVerified: boolean;
//     phoneNumber?: string;
//     phoneVerified?: boolean;
//     firstName?: string;
//     lastName?: string;
//     status: string;
//     accountStatus?: string;
// }

// interface EmailVerificationTokenData {
//     userId: string;
//     email: string;
//     createdAt: number;
//     type: 'link' | 'otp';
// }

// interface EmailTokenResult {
//     userId: string;
//     email: string;
//     tokenHash: string;
// }

// interface EmailVerificationResult {
//     otp?: string;
//     token?: string;
//     verificationLink?: string;
//     expiryMinutes?: number;
//     expiryHours?: number;
// }

// interface RateLimitResult {
//     allowed: boolean;
//     remainingAttempts: number;
//     retryAfter?: number;
//     attempts?: number;
// }

// // interface PhoneOTPResult {
// //     otp: string;
// //     expiryMinutes: number;
// // }

// // interface PhoneVerificationResult {
// //     verified: boolean;
// //     phoneNumber: string;
// // }

// // interface EmailVerifyByLinkResult {
// //     success: boolean;
// //     alreadyVerified: boolean;
// //     user: {
// //         userId: string;
// //         email: string;
// //         firstName: string;
// //         emailVerified: boolean;
// //         emailVerifiedAt?: Date;
// //     };
// // }

// // ==================== AUTH SERVICE CLASS ====================

// class AuthService {

//     /**
//      * ✅ FIXED: Check account locked (3 attempts in 15 min)
//      */
//     static async checkAccountLocked(email: string, ipAddress: string): Promise<boolean> {
//         try {
//             // Check IP-based blocking first (works for all users)
//             const ipAttempts = await LoginAttempt.countDocuments({
//                 ipAddress,
//                 status: 'failed',
//                 attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
//             });
//             if (ipAttempts >= 3) {
//                 logger.warn('IP blocked after 3 attempts', { ipAddress });
//                 return true;
//             }
//             // Then check user-specific
//             const user = await User.findOne({ email }).select('userId accountStatus lockUntil');
//             if (!user) return false;
//             // Check if account manually locked
//             if (user.accountStatus === 'locked') {
//                 logger.warn('Account locked', { userId: user.userId, email });
//                 return true;
//             }
//             // Check if temporarily locked (lockUntil)
//             if (user.lockUntil && user.lockUntil > new Date()) {
//                 logger.warn('Account temporarily locked', { userId: user.userId, email });
//                 return true;
//             }
//             // Check user+IP specific attempts
//             const userAttempts = await LoginAttempt.countDocuments({
//                 userId: user.userId,
//                 ipAddress,
//                 status: 'failed',
//                 attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
//             });
//             return userAttempts >= 3;
//         } catch (error: any) {
//             logger.error('Account lock check failed', { error: error.message, email });
//             return false; // Don't block on error
//         }
//     }

//     /**
//      * Register a new user
//      */
//     static async register(email: string, password: string, profileData: ProfileData = {
//         firstName: '',
//         location: '',
//         userType: 'working'
//     }, deviceData: DeviceData = {}): Promise<RegisterResult> {
//         try {
//             if (!validator.isEmail(email)) throw new Error('Invalid email format');
//             if (password.length < 8) throw new Error('Password must be at least 8 characters');
//             const existingUser = await User.findOne({ email });
//             if (existingUser) {
//                 await AuditLog.logAction({
//                     userId: existingUser.userId,
//                     userEmail: email,
//                     action: 'REGISTRATION_FAILED',
//                     ipAddress: deviceData.ipAddress || '0.0.0.0',
//                     status: 'FAILURE',
//                     severity: 'LOW',
//                     metadata: new Map([
//                         ['email', email],
//                         ['reason', 'user_already_exists']]),
//                 });
//                 throw new Error('User already exists, please login instead or create account with a different email.');
//             }
//             // ✅ FIXED: Create user with ALL fields including username and phoneNumber
//             const user = new User({
//                 email,
//                 passwordHash: password,
//                 phoneNumber: profileData.phoneNumber,
//                 firstName: profileData.firstName,        // Required
//                 lastName: profileData.lastName,
//                 location: profileData.location,          // ✅ NEW
//                 metadata: {
//                     registrationIp: deviceData.ipAddress,
//                     registrationDevice: deviceData.deviceName,
//                     registrationLocation: profileData.location,  // ✅ ADD
//                 },
//                 onboarding: {                            // ✅ NEW SECTION
//                     userType: profileData.userType,
//                     completedAt: new Date(),

//                     ...(profileData.userType === 'working' && {
//                         workingProfile: {
//                             jobTitle: profileData.jobTitle,
//                             companyName: profileData.companyName,
//                             startDate: profileData.startDate ? new Date(profileData.startDate) : undefined,
//                             endDate: profileData.endDate ? new Date(profileData.endDate) : undefined,
//                         },
//                     }),

//                     ...(profileData.userType === 'student' && {
//                         studentProfile: {
//                             collegeName: profileData.collegeName,
//                             degree: profileData.degree,
//                             fieldOfStudy: profileData.fieldOfStudy,
//                             graduationYear: profileData.graduationYear,
//                         },
//                     }),

//                     ...(profileData.userType === 'fresher' && {
//                         fresherProfile: {
//                             highestEducation: profileData.highestEducation,
//                             preferredRole: profileData.preferredRole,
//                             cgpa: profileData.cgpa,
//                         },
//                     }),
//                 },
//             });

//             logger.info('Creating new user', {
//                 email,
//                 firstName: profileData.firstName,
//                 location: profileData.location,          // ✅ ADD
//                 userType: profileData.userType,          // ✅ ADD
//                 phoneNumber: profileData.phoneNumber,
//                 hasWorkingProfile: profileData.userType === 'working',
//                 hasStudentProfile: profileData.userType === 'student',
//                 hasFresherProfile: profileData.userType === 'fresher',
//             });

//             await user.save();

//             // ✅ Generate username fallback only if not provided
//             const username = // profileData.username ||  // ❌ COMMENTED OUT
//                 email.split('@')[0]
//                     .replace(/[^a-zA-Z0-9]/g, '_')
//                 + '_' + Date.now().toString().slice(-6);

//             const displayName = profileData.displayName ||
//                 (profileData.firstName && profileData.lastName
//                     ? `${profileData.firstName} ${profileData.lastName}`
//                     : username);

//             const userProfile = new UserProfile({
//                 userId: user.userId,
//                 username,
//                 displayName,
//                 firstName: profileData.firstName,    // Required
//                 lastName: profileData.lastName,
//                 location: {                          // ✅ NEW: Structured location
//                     city: profileData.location,
//                     country: 'India',  // Default or detect from city
//                     timezone: 'Asia/Kolkata',  // Default or detect
//                 },
//             });

//             await userProfile.save();

//             const device = await Device.registerDevice(user.userId, {
//                 deviceType: deviceData.deviceType || 'desktop',
//                 deviceName: deviceData.deviceName || 'Unknown Device',
//                 os: deviceData.os || 'Unknown',
//                 browser: deviceData.browser || 'Unknown',
//                 userAgent: deviceData.userAgent || 'Unknown',
//             });

//             // Create session
//             const session = await Session.createSession({
//                 userId: user.userId,
//                 ipAddress: deviceData.ipAddress || '0.0.0.0',
//                 deviceId: device.deviceId,
//                 sessionType: 'web',
//                 deviceInfo: {
//                     userAgent: deviceData.userAgent,
//                     browser: deviceData.browser,
//                     os: deviceData.os,
//                     // deviceType: deviceData.deviceType || 'other',
//                 }
//             });

//             await AuditLog.logAction({
//                 userId: user.userId,
//                 userEmail: email,
//                 action: 'USER_REGISTERED',
//                 ipAddress: deviceData.ipAddress || '0.0.0.0',
//                 status: 'SUCCESS',
//                 severity: 'LOW',
//                 metadata: new Map([
//                     // ['username', user.username],
//                     ['email', email],
//                     ['firstName', user.firstName],
//                     ['location', user.location],
//                     ['userType', user.onboarding?.userType],
//                     ['phoneNumber', user.phoneNumber],
//                     ['deviceId', device.deviceId],
//                 ]),
//             });

//             userEmitter.emit('user:registered', {
//                 userId: user.userId,
//                 email,
//                 firstName: profileData.firstName,
//                 lastName: profileData.lastName,
//                 location: profileData.location,
//                 userType: profileData.userType,
//                 timestamp: new Date(),
//             });

//             // ✅ FINAL RETURN - Only data needed for JWT generation
//             return {
//                 userId: user.userId,
//                 email,
//                 role: user.role || 'user',
//                 sessionId: session._id,
//                 deviceId: device.deviceId,
//             };

//         } catch (error: any) {
//             logger.error('User registration failed', {
//                 error: error.message,
//                 email,
//                 // username: profileData.username
//             });
//             throw error;
//         }
//     }

//     /**
//      * ✅ COMPLETELY FIXED: Login with proper password check and attempt tracking
//      */
//     static async login(email: string, password: string, ipAddress: string, deviceData: DeviceData = {}): Promise<LoginResult> {
//         let userId: string | null = null;
//         try {
//             logger.info('Login process started', { email, ipAddress });
//             // Step 1: Find user
//             const user = await User.findOne({ email }).select('+passwordHash +passwordSalt');
//             if (!user) {
//                 logger.warn('Login failed: User not found', { email });
//                 // Record anonymous failed attempt (no userId)
//                 try {
//                     await LoginAttempt.recordAttempt(null, ipAddress, 'login', 'failed', {
//                         userAgent: deviceData.userAgent,
//                         failureReason: 'invalid_credentials',
//                         metadata: { email, reason: 'user_not_found' }
//                     });
//                 } catch (attemptError: any) {
//                     logger.error('LoginAttempt recording failed (non-critical)', {
//                         error: attemptError.message
//                     });
//                 }
//                 throw new Error('Invalid credentials');
//             }
//             userId = user.userId;
//             logger.debug('User found', { userId, email });
//             // Step 2: Check account status
//             if (user.accountStatus === 'locked') {
//                 logger.warn('Login failed: Account locked', { userId });
//                 try {
//                     await LoginAttempt.recordAttempt(userId, ipAddress, 'login', 'blocked', {
//                         userAgent: deviceData.userAgent,
//                         failureReason: 'account_locked',
//                         metadata: { reason: 'account_locked' }
//                     });
//                 } catch (attemptError: any) {
//                     logger.error('LoginAttempt recording failed (non-critical)', {
//                         error: attemptError.message
//                     });
//                 }
//                 throw new Error('Account is locked. Contact support.');
//             }
//             if (user.accountStatus === 'disabled') {
//                 logger.warn('Login failed: Account disabled', { userId });
//                 try {
//                     await LoginAttempt.recordAttempt(userId, ipAddress, 'login', 'blocked', {
//                         userAgent: deviceData.userAgent,
//                         failureReason: 'account_disabled',
//                         metadata: { reason: 'account_disabled' }
//                     });
//                 } catch (attemptError: any) {
//                     logger.error('LoginAttempt recording failed (non-critical)', {
//                         error: attemptError.message
//                     });
//                 }
//                 throw new Error('Account is disabled. Contact support.');
//             }
//             // Step 3: Check 3-attempt limit BEFORE password check
//             const recentAttempts = await LoginAttempt.countDocuments({
//                 userId: user.userId,
//                 ipAddress,
//                 status: 'failed',
//                 attemptedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) },
//             });
//             if (recentAttempts >= 3) {
//                 logger.warn('Login blocked: Too many attempts', { userId, attempts: recentAttempts });
//                 try {
//                     await LoginAttempt.recordAttempt(userId, ipAddress, 'login', 'blocked', {
//                         userAgent: deviceData.userAgent,
//                         failureReason: 'rate_limited',
//                         metadata: { attempts: recentAttempts }
//                     });
//                     await User.lockAccount(user.userId, 'too_many_attempts');
//                 } catch (attemptError: any) {
//                     logger.error('LoginAttempt recording failed (non-critical)', {
//                         error: attemptError.message
//                     });
//                 }
//                 throw new Error('Account locked after 3 failed attempts');
//             }
//             // Step 4: ✅ Direct bcrypt compare
//             logger.debug('Verifying password', { userId });
//             if (!user.passwordHash) {
//                 logger.error('Password hash missing', { userId });
//                 throw new Error('Invalid credentials');
//             }
//             const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
//             if (!isPasswordValid) {
//                 logger.warn('Login failed: Invalid password', { userId });
//                 try {
//                     await LoginAttempt.recordAttempt(userId, ipAddress, 'login', 'failed', {
//                         userAgent: deviceData.userAgent,
//                         failureReason: 'invalid_credentials',
//                         metadata: { reason: 'wrong_password' }
//                     });
//                 } catch (attemptError: any) {
//                     logger.error('LoginAttempt recording failed (non-critical)', {
//                         error: attemptError.message
//                     });
//                 }
//                 throw new Error('Invalid credentials');
//             }
//             logger.info('Password verified successfully', { userId });
//             // Step 5: Update last login
//             await user.updateLastLogin(ipAddress);
//             logger.info('update last login successfully', { userId });
//             // Step 6: Register/get device
//             const device = await Device.registerDevice(user.userId, deviceData);
//             logger.debug('Device registered', { userId, deviceId: device.deviceId });
//             // Step 7: Create session
//             const session = await Session.createSession({
//                 userId: user.userId,
//                 ipAddress,
//                 deviceId: device.deviceId,
//                 sessionType: 'web',
//                 // deviceInfo: deviceData,
//             });
//             logger.info('Session created', { userId, sessionId: session._id });
//             // Step 8: Record successful login attempt
//             try {
//                 await LoginAttempt.recordAttempt(userId, ipAddress, 'login', 'success', {
//                     userAgent: deviceData.userAgent,
//                     deviceId: device.deviceId,
//                     sessionId: session._id,
//                     metadata: { loginTime: new Date() }
//                 });
//             } catch (attemptError: any) {
//                 logger.error('LoginAttempt recording failed (non-critical)', {
//                     error: attemptError.message
//                 });
//                 // Don't throw - login was successful
//             }
//             logger.info('Login successful', { userId, sessionId: session._id });
//             // ============ COMPLIANCE & SECURITY CHECKS AFTER SUCCESSFUL LOGIN ============
//             // try {
//             // const ipAddress = deviceData.ipAddress || ipAddress; // fallback
//             // const userAgent = deviceData.userAgent || 'Unknown';
//             // // 1. 90-Day Password Re-verification
//             // const passwordCompliance = await ComplianceService.check90DayPasswordCompliance(user.userId);
//             // if (passwordCompliance.requiresReVerification) {
//             // logger.warn('90-day password re-verification required', { userId });
//             // throw new Error(
//             // JSON.stringify({
//             // compliance: 'PASSWORD_90DAY_REQUIRED',
//             // requiresPasswordReVerification: true,
//             // daysSinceChange: passwordCompliance.daysSinceChange,
//             // message: 'Please re-enter your password to continue (90-day security policy)'
//             // })
//             // );
//             // }
//             // // 2. Annual Identity Re-check
//             // const identityCompliance = await ComplianceService.checkAnnualIdentityCompliance(user.userId);
//             // if (identityCompliance.requiresIdentityReCheck) {
//             // logger.warn('Annual identity re-verification required', { userId });
//             // throw new Error(
//             // JSON.stringify({
//             // compliance: 'ANNUAL_IDENTITY_REQUIRED',
//             // requiresIdentityReCheck: true,
//             // requiresEmailReCheck: identityCompliance.requiresEmailReCheck,
//             // requiresPhoneReCheck: identityCompliance.requiresPhoneReCheck,
//             // message: 'Annual identity verification required'
//             // })
//             // );
//             // }
//             // // 3. Unusual Activity Detection
//             // const activityCheck = await ComplianceService.detectUnusualActivity(
//             // user.userId,
//             // ipAddress,
//             // userAgent
//             // );
//             // if (activityCheck.isUnusual && activityCheck.requiresVerification) {
//             // await ComplianceService.sendUnusualActivityVerification(
//             // user.userId,
//             // activityCheck,
//             // ipAddress
//             // );
//             // logger.warn('Unusual activity detected - verification sent', { userId });
//             // throw new Error(
//             // JSON.stringify({
//             // compliance: 'UNUSUAL_ACTIVITY',
//             // requiresActivityVerification: true,
//             // message: 'Unusual activity detected. Verification code sent to your email.',
//             // details: activityCheck
//             // })
//             // );
//             // }
//             // // 4. Suspicious Location Check
//             // const locationCheck = await ComplianceService.checkSuspiciousLocation(user.userId, ipAddress);
//             // if (locationCheck.isSuspicious && locationCheck.requiresVerification) {
//             // await ComplianceService.sendSuspiciousLocationVerification(
//             // user.userId,
//             // locationCheck.location,
//             // ipAddress
//             // );
//             // logger.warn('Suspicious location detected - verification sent', { userId });
//             // throw new Error(
//             // JSON.stringify({
//             // compliance: 'SUSPICIOUS_LOCATION',
//             // requiresLocationVerification: true,
//             // message: 'New location detected. Please check your email to verify.',
//             // details: locationCheck
//             // })
//             // );
//             // }
//             // } catch (complianceError) {
//             // // Re-throw as structured error — will be caught in controller
//             // throw complianceError;
//             // }
//             // ✅ FINAL RETURN - Only data needed for JWT generation
//             return {
//                 userId: user.userId,
//                 sessionId: session._id,
//                 deviceId: device.deviceId,
//             };
//         } catch (error: any) {
//             logger.error('Login failed', {
//                 error: error.message,
//                 email,
//                 userId: userId || 'unknown'
//             });
//             throw error;
//         }
//     }

//     /**
//     * ✅ NEW: GitHub OAuth Authentication
//     */
//     static async authenticateWithGitHub(
//         githubProfile: any,
//         accessToken: string,
//         refreshToken: string,
//         ipAddress: string,
//         deviceData: DeviceData = {}
//     ): Promise<RegisterResult> {
//         try {
//             const githubId = githubProfile.id;
//             const githubUsername = githubProfile.username;

//             // Get primary email from GitHub
//             let email = githubProfile.emails?.find((e: any) => e.primary)?.value;
//             if (!email) {
//                 email = githubProfile.emails?.[0]?.value;
//             }
//             if (!email) {
//                 throw new Error('No email found in GitHub profile');
//             }

//             logger.info('GitHub OAuth authentication started', {
//                 githubId,
//                 email,
//                 username: githubUsername,
//             });

//             // ==================== CHECK EXISTING USER ====================
//             let user = await User.findOne({
//                 $or: [
//                     { email: email.toLowerCase() },
//                     { 'oauthProviders.provider': 'github', 'oauthProviders.providerId': githubId }
//                 ]
//             });

//             // ==================== EXISTING USER - LINK GITHUB ====================
//             if (user) {
//                 // Check if GitHub is already linked
//                 const githubLinked = user.oauthProviders?.some(
//                     (p) => p.provider === 'github' && p.providerId === githubId
//                 );

//                 if (!githubLinked) {
//                     // Link GitHub account
//                     user.oauthProviders = user.oauthProviders || [];
//                     user.oauthProviders.push({
//                         provider: 'github',
//                         providerId: githubId,
//                         accessToken: accessToken,
//                         refreshToken: refreshToken,
//                         connectedAt: new Date(),
//                     });
//                     await user.save();

//                     logger.info('GitHub account linked to existing user', {
//                         userId: user.userId,
//                         email,
//                     });
//                 }

//                 // Update last login
//                 await user.updateLastLogin(ipAddress);

//             } else {
//                 // ==================== NEW USER - CREATE ACCOUNT ====================
//                 logger.info('Creating new user from GitHub OAuth', { email, githubId });

//                 // Extract name from GitHub profile
//                 const fullName = githubProfile.displayName || githubProfile.name || githubUsername;
//                 const [firstName, ...lastNameParts] = fullName.split(' ');
//                 const lastName = lastNameParts.join(' ') || undefined;

//                 // Generate unique username
//                 const username = await this.generateUniqueUsername(githubUsername || email.split('@')[0]);

//                 // Create user WITHOUT password (OAuth user)
//                 user = new User({
//                     email: email.toLowerCase(),
//                     username,
//                     firstName: firstName || githubUsername,
//                     lastName,
//                     location: githubProfile.location || 'Not specified', // ✅ Required field
//                     emailVerified: true, // GitHub emails are verified
//                     emailVerifiedAt: new Date(),
//                     onboarding: {
//                         userType: 'fresher', // ✅ Default for OAuth users
//                         completedAt: new Date(),
//                         fresherProfile: {
//                             highestEducation: 'Not specified',
//                             preferredRole: 'Not specified',
//                         }
//                     },
//                     oauthProviders: [
//                         {
//                             provider: 'github',
//                             providerId: githubId,
//                             accessToken: accessToken,
//                             refreshToken: refreshToken,
//                             connectedAt: new Date(),
//                         },
//                     ],
//                     metadata: {
//                         registrationIp: ipAddress,
//                         registrationDevice: deviceData.deviceName,
//                         registrationLocation: githubProfile.location,
//                     },
//                 });

//                 await user.save();

//                 logger.info('New user created via GitHub OAuth', {
//                     userId: user.userId,
//                     email,
//                 });

//                 // Create user profile
//                 await UserProfile.create({
//                     userId: user.userId,
//                     username,
//                     displayName: fullName,
//                     firstName: firstName || githubUsername,
//                     lastName,
//                     bio: githubProfile.bio,
//                     avatar: {
//                         url: githubProfile.photos?.[0]?.value || githubProfile.avatar_url,
//                     },
//                     social: {
//                         github: githubProfile.html_url,
//                     },
//                     location: {
//                         city: githubProfile.location || 'Unknown',
//                         country: 'Unknown',
//                     },
//                 });

//                 // Emit event
//                 userEmitter.emit('user:registered', {
//                     userId: user.userId,
//                     email,
//                     registrationMethod: 'github_oauth',
//                     timestamp: new Date(),
//                 });
//             }

//             // ==================== CREATE DEVICE & SESSION ====================
//             const device = await Device.registerDevice(user.userId, {
//                 deviceType: deviceData.deviceType || 'desktop',
//                 deviceName: deviceData.deviceName || 'GitHub OAuth Device',
//                 os: deviceData.os || 'Unknown',
//                 browser: deviceData.browser || 'Unknown',
//                 userAgent: deviceData.userAgent || 'Unknown',
//             });

//             const session = await Session.createSession({
//                 userId: user.userId,
//                 ipAddress,
//                 deviceId: device.deviceId,
//                 sessionType: 'web',
//                 deviceInfo: {
//                     userAgent: deviceData.userAgent,
//                     browser: deviceData.browser,
//                     os: deviceData.os,
//                 },
//             });

//             // ==================== RECORD LOGIN ATTEMPT ====================
//             await LoginAttempt.recordAttempt(user.userId, ipAddress, 'login', 'success', {
//                 userAgent: deviceData.userAgent,
//                 deviceId: device.deviceId,
//                 sessionId: session._id,
//                 metadata: { loginMethod: 'github_oauth' },
//             });

//             // ==================== AUDIT LOG ====================
//             await AuditLog.logAction({
//                 userId: user.userId,
//                 userEmail: user.email,
//                 action: 'USER_LOGIN',
//                 ipAddress,
//                 status: 'SUCCESS',
//                 severity: 'LOW',
//                 metadata: new Map([
//                     ['loginMethod', 'github_oauth'],
//                     ['githubId', githubId],
//                     ['deviceId', device.deviceId],
//                 ]),
//             });

//             logger.info('GitHub OAuth authentication successful', {
//                 userId: user.userId,
//                 sessionId: session._id,
//             });

//             return {
//                 userId: user.userId,
//                 email: user.email,
//                 role: user.role || 'user',
//                 sessionId: session._id,
//                 deviceId: device.deviceId,
//             };

//         } catch (error: any) {
//             logger.error('GitHub OAuth authentication failed', {
//                 error: error.message,
//                 stack: error.stack,
//             });
//             throw error;
//         }
//     }

//     /**
//      * ✅ Helper: Generate unique username
//      */
//     private static async generateUniqueUsername(base: string): Promise<string> {
//         const cleanBase = base.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
//         let username = cleanBase;
//         let counter = 1;

//         while (await User.findOne({ username })) {
//             username = `${cleanBase}_${counter}`;
//             counter++;
//         }

//         return username;
//     }

//     // ==================== GET USER PROFILE ====================
//     /**
//      * Get user profile by userId with caching
//      * Cache Strategy: L1 (Redis) → L2 (MongoDB)
//      *
//      * @param {string} userId - User ID (UUID)
//      * @param {ProfileOptions} options - Options { includeStats, includeSessions }
//      * @returns {Promise<Object>} User profile data
//      */
//     static async getUserProfile(userId: string, options: ProfileOptions = {}): Promise<any> {
//         const correlationId = uuidv4();
//         try {
//             LoggerUtil.info('Fetching user profile', { userId, correlationId });
//             // ✅ Step 1: Check Redis cache first
//             const cacheKey = `user:profile:${userId}`;
//             const cachedProfile = await CacheUtil.get(cacheKey);
//             if (cachedProfile) {
//                 LoggerUtil.debug('User profile cache HIT', { userId, correlationId });
//                 return {
//                     ...cachedProfile,
//                     _meta: {
//                         source: 'cache',
//                         timestamp: new Date().toISOString(),
//                         correlationId,
//                     }
//                 };
//             }
//             LoggerUtil.debug('User profile cache MISS', { userId, correlationId });
//             // ✅ Step 2: Fetch from MongoDB
//             const user = await User.findOne({ userId })
//                 .select('-passwordHash -passwordSalt -backupCodes -__v')
//                 .lean()
//                 .exec();
//             if (!user) {
//                 LoggerUtil.warn('User not found', { userId, correlationId });
//                 throw new Error('User not found');
//             }

//             // ✅ Step 3: Build response object
//             // const profile: Record<string, any> = {
//             //     userId: user.userId,
//             //     email: user.email,
//             //     firstName: user.firstName,
//             //     lastName: user.lastName,
//             //     location: user.location,
//             //     onboarding: {
//             //         userType: user.onboarding?.userType || 'unknown',
//             //         completedAt: user.onboarding?.completedAt || null,
//             //     },
//             //     freshProfile: {
//             //         highestEducation: user.onboarding?.fresherProfile?.highestEducation || null,
//             //         preferredRole: user.onboarding?.fresherProfile?.preferredRole || null,
//             //     },
//             //     role: user.role,
//             //     status: user.status,
//             //     emailVerified: user.emailVerified,
//             //     phoneVerified: user.phoneVerified,
//             //     phone: user.phoneNumber || null,
//             //     twoFactorEnabled: user.twoFactorEnabled,
//             //     preferences: user.preferences,
//             //     metadata: {
//             //         totalLogins: user.metadata?.totalLogins || 0,
//             //         lastLoginAt: user.lastLoginAt || null,
//             //         lastLoginIp: user.lastLoginIp || null,
//             //         lastActiveAt: user.metadata?.lastActiveAt || null,
//             //     },
//             //     createdAt: user.createdAt,
//             //     updatedAt: user.updatedAt,
//             // };

//             // ✅ Step 3: Build response object
//             const profile: Record<string, any> = {
//                 userId: user.userId,
//                 email: user.email,
//                 firstName: user.firstName,
//                 lastName: user.lastName,
//                 location: user.location,
//                 coverPhotoId: user.coverPhotoId,
//                 profilePhotoId: user.profilePhotoId,
//                 analyticsId: user.analyticsId,
//                 companyId: user.companyId,
//                 headlineId: user.headlineId,
//                 aboutId: user.aboutId,
//                 experienceIds: user.experienceIds,
//                 phoneNumber: user.phoneNumber || null,
//                 // ✅ Activity IDs
//                 activityIds: {
//                     postIds: user.activityIds?.postIds || [],
//                     commentIds: user.activityIds?.commentIds || [],
//                     videoIds: user.activityIds?.videoIds || [],
//                     imageIds: user.activityIds?.imageIds || [],
//                     documentIds: user.activityIds?.documentIds || [],
//                 },

//                 // ✅ Activity Stats
//                 activityStats: {
//                     totalPosts: user.activityStats?.totalPosts || 0,
//                     totalComments: user.activityStats?.totalComments || 0,
//                     totalVideos: user.activityStats?.totalVideos || 0,
//                     totalImages: user.activityStats?.totalImages || 0,
//                     totalDocuments: user.activityStats?.totalDocuments || 0,
//                 },
//                 // ✅ RETURN ALL ONBOARDING DATA
//                 onboarding: {
//                     userType: user.onboarding?.userType || 'unknown',
//                     completedAt: user.onboarding?.completedAt || null,

//                     // Working profile (if exists)
//                     ...(user.onboarding?.userType === 'working' && {
//                         workingProfile: {
//                             jobTitle: user.onboarding.workingProfile?.jobTitle || null,
//                             companyName: user.onboarding.workingProfile?.companyName || null,
//                             startDate: user.onboarding.workingProfile?.startDate || null,
//                             endDate: user.onboarding.workingProfile?.endDate || null,
//                         }
//                     }),

//                     // Student profile (if exists)
//                     ...(user.onboarding?.userType === 'student' && {
//                         studentProfile: {
//                             collegeName: user.onboarding.studentProfile?.collegeName || null,
//                             degree: user.onboarding.studentProfile?.degree || null,
//                             fieldOfStudy: user.onboarding.studentProfile?.fieldOfStudy || null,
//                             graduationYear: user.onboarding.studentProfile?.graduationYear || null,
//                         }
//                     }),

//                     // Fresher profile (if exists)
//                     ...(user.onboarding?.userType === 'fresher' && {
//                         fresherProfile: {
//                             highestEducation: user.onboarding.fresherProfile?.highestEducation || null,
//                             preferredRole: user.onboarding.fresherProfile?.preferredRole || null,
//                             cgpa: user.onboarding.fresherProfile?.cgpa || null,
//                         }
//                     }),
//                 },

//                 role: user.role,
//                 status: user.status,
//                 emailVerified: user.emailVerified,
//                 phoneVerified: user.phoneVerified,
//                 twoFactorEnabled: user.twoFactorEnabled,
//                 preferences: user.preferences,
//                 metadata: {
//                     totalLogins: user.metadata?.totalLogins || 0,
//                     lastLoginAt: user.lastLoginAt || null,
//                     lastLoginIp: user.lastLoginIp || null,
//                     lastActiveAt: user.metadata?.lastActiveAt || null,
//                 },
//                 createdAt: user.createdAt,
//                 updatedAt: user.updatedAt,
//             };

//             // ✅ Step 4: Include optional stats
//             if (options.includeStats) {
//                 const [activeSessions, activeDevices] = await Promise.all([
//                     Session.countDocuments({ userId, status: 'active' }),
//                     Device.countDocuments({ userId, isActive: true }),
//                 ]);
//                 profile.stats = {
//                     activeSessions,
//                     activeDevices,
//                     accountAge: Math.floor(
//                         (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
//                     ),
//                 };
//             }
//             // ✅ Step 5: Include active sessions (if requested)
//             if (options.includeSessions) {
//                 const sessions = await Session.find({ userId, status: 'active' })
//                     .select('sessionId deviceId ipAddress createdAt lastActivityAt')
//                     .sort({ lastActivityAt: -1 })
//                     .limit(10)
//                     .lean();
//                 profile.activeSessions = sessions;
//             }
//             // ✅ Step 6: Cache the profile (15 minutes TTL)
//             await CacheUtil.set(cacheKey, profile, 900);
//             LoggerUtil.info('User profile fetched successfully', {
//                 userId,
//                 source: 'database',
//                 correlationId
//             });
//             return {
//                 ...profile,
//                 _meta: {
//                     source: 'database',
//                     timestamp: new Date().toISOString(),
//                     correlationId,
//                 }
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Failed to fetch user profile', {
//                 error: error.message,
//                 userId,
//                 correlationId,
//             });
//             throw new Error(error.message || 'Failed to fetch user profile');
//         }
//     }

//     // ==================== GET USER BY ID ====================
//     /**
//      * Get user by userId (UUID-based lookup)
//      *
//      * @param {string} userId - User UUID
//      * @param {ProfileOptions} options - Optional fields to include
//      * @returns {Promise<any>} User data
//      */
//     static async getUserById(userId: string, options: ProfileOptions = {}): Promise<any> {
//         const correlationId = uuidv4();

//         try {
//             LoggerUtil.info('Fetching user by ID', { userId, correlationId });

//             // ✅ Step 1: Validate UUID format
//             const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
//             if (!uuidRegex.test(userId)) {
//                 throw new Error('Invalid user ID format');
//             }

//             // ✅ Step 2: Check Redis cache first
//             const cacheKey = `user:${userId}`;
//             const cachedUser = await CacheUtil.get(cacheKey);

//             if (cachedUser) {
//                 LoggerUtil.debug('User cache HIT', { userId, correlationId });
//                 const parsed = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser;

//                 return {
//                     ...parsed,
//                     _meta: {
//                         source: 'cache',
//                         timestamp: new Date().toISOString(),
//                         correlationId,
//                     }
//                 };
//             }

//             LoggerUtil.debug('User cache MISS', { userId, correlationId });

//             // ✅ Step 3: Fetch from MongoDB
//             const user = await User.findOne({
//                 userId,
//                 'flags.isDeleted': false
//             })
//                 .select('-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v')
//                 .lean()
//                 .exec();

//             if (!user) {
//                 LoggerUtil.warn('User not found', { userId, correlationId });
//                 throw new Error('User not found');
//             }

//             // ✅ Step 4: Check user status
//             if (user.status !== 'active') {
//                 LoggerUtil.warn('User is not active', {
//                     userId,
//                     status: user.status,
//                     correlationId
//                 });
//                 throw new Error('User account is not active');
//             }

//             // ✅ Step 5: Build response object
//             const userResponse: Record<string, any> = {
//                 userId: user.userId,
//                 email: user.email,
//                 firstName: user.firstName,
//                 lastName: user.lastName,
//                 location: user.location,
//                 profilePhotoId: user.profilePhotoId,
//                 coverPhotoId: user.coverPhotoId,
//                 analyticsId: user.analyticsId,
//                 companyId: user.companyId,
//                 headlineId: user.headlineId,
//                 aboutId: user.aboutId,
//                 experienceIds: user.experienceIds,
//                 phoneNumber: user.phoneNumber || null,

//                 // Activity IDs
//                 activityIds: {
//                     postIds: user.activityIds?.postIds || [],
//                     commentIds: user.activityIds?.commentIds || [],
//                     videoIds: user.activityIds?.videoIds || [],
//                     imageIds: user.activityIds?.imageIds || [],
//                     documentIds: user.activityIds?.documentIds || [],
//                 },

//                 // Activity Stats
//                 activityStats: {
//                     totalPosts: user.activityStats?.totalPosts || 0,
//                     totalComments: user.activityStats?.totalComments || 0,
//                     totalVideos: user.activityStats?.totalVideos || 0,
//                     totalImages: user.activityStats?.totalImages || 0,
//                     totalDocuments: user.activityStats?.totalDocuments || 0,
//                 },

//                 // Onboarding data
//                 onboarding: {
//                     userType: user.onboarding?.userType || 'unknown',
//                     completedAt: user.onboarding?.completedAt || null,

//                     ...(user.onboarding?.userType === 'working' && {
//                         workingProfile: {
//                             jobTitle: user.onboarding.workingProfile?.jobTitle || null,
//                             companyName: user.onboarding.workingProfile?.companyName || null,
//                             startDate: user.onboarding.workingProfile?.startDate || null,
//                             endDate: user.onboarding.workingProfile?.endDate || null,
//                         }
//                     }),

//                     ...(user.onboarding?.userType === 'student' && {
//                         studentProfile: {
//                             collegeName: user.onboarding.studentProfile?.collegeName || null,
//                             degree: user.onboarding.studentProfile?.degree || null,
//                             fieldOfStudy: user.onboarding.studentProfile?.fieldOfStudy || null,
//                             graduationYear: user.onboarding.studentProfile?.graduationYear || null,
//                         }
//                     }),

//                     ...(user.onboarding?.userType === 'fresher' && {
//                         fresherProfile: {
//                             highestEducation: user.onboarding.fresherProfile?.highestEducation || null,
//                             preferredRole: user.onboarding.fresherProfile?.preferredRole || null,
//                             cgpa: user.onboarding.fresherProfile?.cgpa || null,
//                         }
//                     }),
//                 },

//                 role: user.role,
//                 status: user.status,
//                 emailVerified: user.emailVerified,
//                 phoneVerified: user.phoneVerified,
//                 twoFactorEnabled: user.twoFactorEnabled,
//                 preferences: user.preferences,

//                 metadata: {
//                     totalLogins: user.metadata?.totalLogins || 0,
//                     lastLoginAt: user.lastLoginAt || null,
//                     lastLoginIp: user.lastLoginIp || null,
//                     lastActiveAt: user.metadata?.lastActiveAt || null,
//                 },

//                 createdAt: user.createdAt,
//                 updatedAt: user.updatedAt,
//             };

//             // ✅ Step 6: Include optional stats
//             if (options.includeStats) {
//                 const [activeSessions, activeDevices] = await Promise.all([
//                     Session.countDocuments({ userId, status: 'active' }),
//                     Device.countDocuments({ userId, isActive: true }),
//                 ]);

//                 userResponse.stats = {
//                     activeSessions,
//                     activeDevices,
//                     accountAge: Math.floor(
//                         (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
//                     ),
//                 };
//             }

//             // ✅ Step 7: Include active sessions (if requested)
//             if (options.includeSessions) {
//                 const sessions = await Session.find({ userId, status: 'active' })
//                     .select('sessionId deviceId ipAddress createdAt lastActivityAt')
//                     .sort({ lastActivityAt: -1 })
//                     .limit(10)
//                     .lean();

//                 userResponse.activeSessions = sessions;
//             }

//             // ✅ Step 8: Cache the result (15 minutes)
//             await CacheUtil.set(cacheKey, JSON.stringify(userResponse), 900);

//             LoggerUtil.info('User fetched successfully by ID', {
//                 userId,
//                 source: 'database',
//                 correlationId
//             });

//             return {
//                 ...userResponse,
//                 _meta: {
//                     source: 'database',
//                     timestamp: new Date().toISOString(),
//                     correlationId,
//                 }
//             };

//         } catch (error: any) {
//             LoggerUtil.error('Failed to fetch user by ID', {
//                 error: error.message,
//                 stack: error.stack,
//                 userId,
//                 correlationId,
//             });

//             throw new Error(error.message || 'Failed to fetch user');
//         }
//     }

//     /**
//     * Get all users with pagination, filtering, and sorting
//     *
//     * @param {GetAllUsersParams} params - Query parameters
//     * @returns {Promise<GetAllUsersResult>} Users list with pagination
//     */
//     static async getAllUsers(params: GetAllUsersParams): Promise<GetAllUsersResult> {
//         const correlationId = uuidv4();

//         try {
//             const { page, limit, skip, filters, sortBy } = params;

//             LoggerUtil.info('Fetching all users from database', {
//                 page,
//                 limit,
//                 filters,
//                 sortBy,
//                 correlationId
//             });

//             // ✅ Step 1: Build MongoDB query
//             const query: any = {
//                 'flags.isDeleted': false,  // Exclude soft-deleted users
//             };

//             // Filter by status
//             if (filters.status) {
//                 query.status = filters.status;
//             }

//             // Filter by role
//             if (filters.role) {
//                 query.role = filters.role;
//             }

//             // Filter by userType
//             if (filters.userType) {
//                 query['onboarding.userType'] = filters.userType;
//             }

//             // Filter by location (case-insensitive partial match)
//             if (filters.location) {
//                 query.location = {
//                     $regex: filters.location,
//                     $options: 'i'  // case-insensitive
//                 };
//             }

//             // Search by email, firstName, lastName (case-insensitive)
//             if (filters.search) {
//                 const searchRegex = {
//                     $regex: filters.search,
//                     $options: 'i'
//                 };

//                 query.$or = [
//                     { email: searchRegex },
//                     { firstName: searchRegex },
//                     { lastName: searchRegex },
//                 ];
//             }

//             LoggerUtil.debug('MongoDB query built', {
//                 query: JSON.stringify(query),
//                 correlationId
//             });

//             // ✅ Step 2: Build sort options
//             let sort: any = {};
//             switch (sortBy) {
//                 case 'oldest':
//                     sort = { createdAt: 1 };
//                     break;
//                 case 'name':
//                     sort = { firstName: 1, lastName: 1 };
//                     break;
//                 case 'email':
//                     sort = { email: 1 };
//                     break;
//                 case 'newest':
//                 default:
//                     sort = { createdAt: -1 };
//                     break;
//             }

//             // ✅ Step 3: Execute query with pagination
//             const [users, total] = await Promise.all([
//                 User.find(query)
//                     .select(`
//                     userId
//                     email
//                     firstName
//                     lastName
//                     location
//                     onboarding.userType
//                     role
//                     status
//                     emailVerified
//                     phoneVerified
//                     phoneNumber
//                     lastLoginAt
//                     metadata.totalLogins
//                     createdAt
//                     updatedAt
//                 `)
//                     .sort(sort)
//                     .skip(skip)
//                     .limit(limit)
//                     .lean()  // ✅ Returns plain JS objects (faster)
//                     .exec(),

//                 User.countDocuments(query)  // ✅ Get total count
//             ]);

//             const totalPages = Math.ceil(total / limit);

//             LoggerUtil.info('Users fetched successfully from database', {
//                 total,
//                 returned: users.length,
//                 totalPages,
//                 page,
//                 correlationId
//             });

//             // ✅ Step 4: Format user data
//             const formattedUsers = users.map((user: any) => ({
//                 userId: user.userId,
//                 email: user.email,
//                 firstName: user.firstName,
//                 lastName: user.lastName || null,
//                 fullName: user.lastName
//                     ? `${user.firstName} ${user.lastName}`
//                     : user.firstName,
//                 location: user.location || null,

//                 // Onboarding info
//                 userType: user.onboarding?.userType || 'not-set',

//                 // Account info
//                 role: user.role,
//                 status: user.status,
//                 emailVerified: user.emailVerified,
//                 phoneVerified: user.phoneVerified,
//                 phoneNumber: user.phoneNumber
//                     ? user.phoneNumber.substring(0, 6) + '****'  // Mask phone number
//                     : null,

//                 // Activity info
//                 lastLoginAt: user.lastLoginAt || null,
//                 totalLogins: user.metadata?.totalLogins || 0,

//                 // Timestamps
//                 createdAt: user.createdAt,
//                 updatedAt: user.updatedAt,
//             }));

//             return {
//                 users: formattedUsers,
//                 total,
//                 totalPages,
//             };

//         } catch (error: any) {
//             LoggerUtil.error('Get all users service failed', {
//                 error: error.message,
//                 stack: error.stack,
//                 correlationId,
//             });

//             throw new Error(error.message || 'Failed to fetch users');
//         }
//     }

//     // ==================== UPDATE USER PROFILE ====================
//     /**
//      * Update user profile with validation
//      *
//      * @param {string} userId - User ID
//      * @param {ProfileUpdates} updates - Fields to update
//      * @param {string} ipAddress - Request IP
//      * @returns {Promise<Object>} Updated user profile
//      */
//     // static async updateUserProfile(userId: string, updates: ProfileUpdates, ipAddress: string): Promise<any> {
//     //     const correlationId = uuidv4();
//     //     try {
//     //         LoggerUtil.info('Updating user profile', {
//     //             userId,
//     //             updates: Object.keys(updates),
//     //             correlationId
//     //         });

//     //         // ✅ Step 1: Validate allowed fields (accept both 'phone' and 'phoneNumber')
//     //         const allowedFields = ['phoneNumber', 'preferences', 'firstName', 'lastName', 'location', 'onboarding'];
//     //         const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
//     //         if (updateFields.length === 0) {
//     //             throw new Error('No valid fields to update');
//     //         }

//     //         // ✅ Step 2: Validate field values
//     //         const validatedUpdates: Partial<ProfileUpdates> = {};

//     //         // Username validation
//     //         // if (updates.username !== undefined) {
//     //         //     if (!updates.username || typeof updates.username !== 'string') {
//     //         //         throw new Error('Invalid username format');
//     //         //     }
//     //         //     const username = updates.username.trim().toLowerCase(); // ✅ Convert to lowercase
//     //         //     if (username.length < 3 || username.length > 30) {
//     //         //         throw new Error('Username must be 3-30 characters');
//     //         //     }
//     //         //     if (!/^[a-z0-9_]+$/.test(username)) {
//     //         //         throw new Error('Username can only contain lowercase letters, numbers, and underscores');
//     //         //     }
//     //         //     // Check if username already exists
//     //         //     const existingUser = await User.findOne({
//     //         //         username,
//     //         //         userId: { $ne: userId }
//     //         //     });
//     //         //     if (existingUser) {
//     //         //         throw new Error('Username already taken');
//     //         //     }
//     //         //     validatedUpdates.username = username;
//     //         // }

//     //         // ✅ Phone validation (handle both 'phone' and 'phoneNumber')
//     //         const phoneValue =
//     //             // updates.phone ||
//     //             updates.phoneNumber;

//     //         if (phoneValue !== undefined) {
//     //             if (phoneValue && !validator.isMobilePhone(phoneValue, 'any')) {
//     //                 throw new Error('Invalid phone number format');
//     //             }
//     //             validatedUpdates.phoneNumber = phoneValue || null; // ✅ Use 'phoneNumber' for DB
//     //             validatedUpdates.phoneVerified = false; // Reset verification when phone changes
//     //         }

//     //         if (updates.location !== undefined) {
//     //             if (updates.location && typeof updates.location !== 'string') {
//     //                 throw new Error('Invalid location format');
//     //             }
//     //             const location = updates.location?.trim();
//     //             if (location && (location.length < 2 || location.length > 50)) {
//     //                 throw new Error('Location must be 2-50 characters');
//     //             }
//     //             if (location && !/^[A-Z][a-zA-Z\s\-]{1,49}$/.test(location)) {
//     //                 throw new Error('Location must start with a capital letter');
//     //             }
//     //             validatedUpdates.location = location || null;
//     //         }

//     //         if (updates.onboarding !== undefined) {
//     //             const currentUser = await User.findOne({ userId }).select('onboarding').lean();
//     //             if (!currentUser) {
//     //                 throw new Error('User not found');
//     //             }

//     //             const userType = updates.onboarding.userType || currentUser.onboarding?.userType;

//     //             if (!userType || !['working', 'student', 'fresher'].includes(userType)) {
//     //                 throw new Error('Invalid user type');
//     //             }

//     //             const onboardingUpdates: any = {
//     //                 userType,
//     //                 completedAt: currentUser.onboarding?.completedAt || new Date(),
//     //             };

//     //             // Working profile validation
//     //             if (userType === 'working' && updates.onboarding.workingProfile) {
//     //                 const wp = updates.onboarding.workingProfile;
//     //                 onboardingUpdates.workingProfile = {
//     //                     jobTitle: wp.jobTitle || currentUser.onboarding?.workingProfile?.jobTitle,
//     //                     companyName: wp.companyName || currentUser.onboarding?.workingProfile?.companyName,
//     //                     startDate: wp.startDate ? new Date(wp.startDate) : currentUser.onboarding?.workingProfile?.startDate,
//     //                     endDate: wp.endDate ? new Date(wp.endDate) : currentUser.onboarding?.workingProfile?.endDate,
//     //                 };
//     //             }

//     //             // Student profile validation
//     //             if (userType === 'student' && updates.onboarding.studentProfile) {
//     //                 const sp = updates.onboarding.studentProfile;
//     //                 onboardingUpdates.studentProfile = {
//     //                     collegeName: sp.collegeName || currentUser.onboarding?.studentProfile?.collegeName,
//     //                     degree: sp.degree || currentUser.onboarding?.studentProfile?.degree,
//     //                     fieldOfStudy: sp.fieldOfStudy || currentUser.onboarding?.studentProfile?.fieldOfStudy,
//     //                     graduationYear: sp.graduationYear || currentUser.onboarding?.studentProfile?.graduationYear,
//     //                 };
//     //             }

//     //             // Fresher profile validation
//     //             if (userType === 'fresher' && updates.onboarding.fresherProfile) {
//     //                 const fp = updates.onboarding.fresherProfile;
//     //                 onboardingUpdates.fresherProfile = {
//     //                     highestEducation: fp.highestEducation || currentUser.onboarding?.fresherProfile?.highestEducation,
//     //                     preferredRole: fp.preferredRole || currentUser.onboarding?.fresherProfile?.preferredRole,
//     //                     cgpa: fp.cgpa || currentUser.onboarding?.fresherProfile?.cgpa,
//     //                 };
//     //             }

//     //             validatedUpdates.onboarding = onboardingUpdates;
//     //         }

//     //         // First name validation
//     //         if (updates.firstName !== undefined) {
//     //             if (updates.firstName && typeof updates.firstName !== 'string') {
//     //                 throw new Error('Invalid first name format');
//     //             }
//     //             validatedUpdates.firstName = updates.firstName?.trim() || null;
//     //         }

//     //         // Last name validation
//     //         if (updates.lastName !== undefined) {
//     //             if (updates.lastName && typeof updates.lastName !== 'string') {
//     //                 throw new Error('Invalid last name format');
//     //             }
//     //             validatedUpdates.lastName = updates.lastName?.trim() || null;
//     //         }


//     //         // Preferences validation
//     //         if (updates.preferences) {
//     //             const currentUser = await User.findOne({ userId }).select('preferences').lean();
//     //             if (!currentUser) {
//     //                 throw new Error('User not found');
//     //             }
//     //             validatedUpdates.preferences = {
//     //                 ...currentUser.preferences,
//     //                 ...updates.preferences,
//     //             };
//     //         }
//     //         // ✅ Step 3: Update in database
//     //         const updatedUser = await User.findOneAndUpdate(
//     //             { userId, 'flags.isDeleted': false },
//     //             {
//     //                 $set: {
//     //                     ...validatedUpdates,
//     //                     updatedAt: new Date()
//     //                 }
//     //             },
//     //             {
//     //                 new: true,
//     //                 runValidators: true,
//     //                 select: '-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v'
//     //             }
//     //         ).lean();
//     //         if (!updatedUser) {
//     //             throw new Error('User not found');
//     //         }
//     //         // ✅ Step 4: Invalidate cache
//     //         try {
//     //             await CacheUtil.del(`user:profile:${userId}`);
//     //             await CacheUtil.del(`${Constants.CACHE_PREFIXES.USER}${userId}`);
//     //             await CacheUtil.clearByPattern(`session:user:${userId}:*`);
//     //         } catch (cacheError: any) {
//     //             LoggerUtil.warn('Cache invalidation failed (non-critical)', {
//     //                 error: cacheError.message,
//     //                 userId
//     //             });
//     //         }
//     //         // ✅ Step 5: Audit log (non-blocking)
//     //         setImmediate(() => {
//     //             AuditProducer.sendAuditEvent({
//     //                 eventId: uuidv4(),
//     //                 userId,
//     //                 action: 'USER_PROFILE_UPDATED',
//     //                 ipAddress,
//     //                 status: 'SUCCESS',
//     //                 severity: 'LOW',
//     //                 timestamp: new Date().toISOString(),
//     //                 metadata: {
//     //                     updatedFields: Object.keys(validatedUpdates),
//     //                     correlationId,
//     //                 },
//     //             }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
//     //         });
//     //         LoggerUtil.info('User profile updated successfully', {
//     //             userId,
//     //             updatedFields: Object.keys(validatedUpdates),
//     //             correlationId
//     //         });
//     //         // ✅ Step 6: Return formatted response with updated data
//     //         return {
//     //             userId: updatedUser.userId,
//     //             email: updatedUser.email,
//     //             phoneNumber: updatedUser.phoneNumber,
//     //             firstName: updatedUser.firstName,
//     //             lastName: updatedUser.lastName,
//     //             location: updatedUser.location,  // ✅ ADD
//     //             onboarding: updatedUser.onboarding,  // ✅ ADD
//     //             phoneVerified: updatedUser.phoneVerified,
//     //             emailVerified: updatedUser.emailVerified,
//     //             preferences: updatedUser.preferences,
//     //             updatedAt: updatedUser.updatedAt,
//     //             updatedFields: Object.keys(validatedUpdates),
//     //         };
//     //     } catch (error: any) {
//     //         LoggerUtil.error('Failed to update user profile', {
//     //             error: error.message,
//     //             stack: error.stack,
//     //             userId,
//     //             correlationId,
//     //         });
//     //         throw new Error(error.message || 'Failed to update profile');
//     //     }
//     // }

//     // ==================== ACCOUNT DEACTIVATION ====================

//     static async updateUserProfile(userId: string, updates: ProfileUpdates, ipAddress: string): Promise<any> {
//         const correlationId = uuidv4();
//         try {
//             LoggerUtil.info('Updating user profile', {
//                 userId,
//                 updates: Object.keys(updates),
//                 correlationId
//             });

//             // ✅ Step 1: Validate allowed fields (UPDATED - Added email, password)
//             const allowedFields = [
//                 'email',
//                 'password',
//                 'phoneNumber',
//                 'firstName',
//                 'lastName',
//                 'location',
//                 'onboarding',
//                 'preferences'
//             ];

//             const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));

//             if (updateFields.length === 0) {
//                 throw new Error('No valid fields to update');
//             }

//             LoggerUtil.debug('Valid fields to update', {
//                 fields: updateFields,
//                 correlationId
//             });

//             // ✅ Step 2: Fetch current user data
//             const currentUser = await User.findOne({ userId })
//                 .select('+passwordHash +passwordSalt preferences onboarding')
//                 .lean();

//             if (!currentUser) {
//                 throw new Error('User not found');
//             }

//             // ✅ Step 3: Validate and prepare updates
//             const validatedUpdates: any = {};

//             // ==================== EMAIL VALIDATION ====================
//             if (updates.email !== undefined) {
//                 const email = updates.email?.trim().toLowerCase();

//                 if (!email) {
//                     throw new Error('Email cannot be empty');
//                 }

//                 if (!validator.isEmail(email)) {
//                     throw new Error('Invalid email format');
//                 }

//                 // Check if email already exists (for other users)
//                 const existingUser = await User.findOne({
//                     email,
//                     userId: { $ne: userId }
//                 });

//                 if (existingUser) {
//                     throw new Error('Email already exists');
//                 }

//                 validatedUpdates.email = email;
//                 validatedUpdates.emailVerified = false; // Reset verification on email change
//                 validatedUpdates.emailVerifiedAt = null;

//                 LoggerUtil.info('Email update validated', {
//                     userId,
//                     newEmail: email,
//                     correlationId
//                 });
//             }

//             // ==================== PASSWORD VALIDATION ====================
//             if (updates.password !== undefined) {
//                 const password = updates.password?.trim();

//                 if (!password) {
//                     throw new Error('Password cannot be empty');
//                 }

//                 if (password.length < 8 || password.length > 128) {
//                     throw new Error('Password must be 8-128 characters');
//                 }

//                 // NIST 800-63B compliant password policy
//                 const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
//                 if (!passwordRegex.test(password)) {
//                     throw new Error('Password must contain uppercase, lowercase, number, and special character');
//                 }

//                 // Hash new password
//                 const salt = await bcrypt.genSalt(12);
//                 const passwordHash = await bcrypt.hash(password, salt);

//                 validatedUpdates.passwordHash = passwordHash;
//                 validatedUpdates.passwordSalt = salt;
//                 validatedUpdates.passwordChangedAt = new Date();

//                 LoggerUtil.info('Password update validated', {
//                     userId,
//                     correlationId
//                 });
//             }

//             // ==================== PHONE NUMBER VALIDATION ====================
//             if (updates.phoneNumber !== undefined) {
//                 const phoneNumber = updates.phoneNumber?.trim();

//                 if (phoneNumber && !validator.isMobilePhone(phoneNumber, 'any')) {
//                     throw new Error('Invalid phone number format (use E.164 format, e.g., +919876543210)');
//                 }

//                 validatedUpdates.phoneNumber = phoneNumber || null;

//                 // Reset phone verification if phone changed
//                 if (phoneNumber !== currentUser.phoneNumber) {
//                     validatedUpdates.phoneVerified = false;
//                     validatedUpdates.phoneVerifiedAt = null;
//                 }

//                 LoggerUtil.debug('Phone number update validated', {
//                     userId,
//                     phoneNumber: phoneNumber ? phoneNumber.substring(0, 6) + '****' : null,
//                     correlationId
//                 });
//             }

//             // ==================== FIRST NAME VALIDATION ====================
//             if (updates.firstName !== undefined) {
//                 const firstName = updates.firstName?.trim();

//                 if (firstName && (firstName.length < 2 || firstName.length > 50)) {
//                     throw new Error('First name must be 2-50 characters');
//                 }

//                 if (firstName && !/^[a-zA-Z\s\-']+$/.test(firstName)) {
//                     throw new Error('First name can only contain letters, spaces, hyphens, and apostrophes');
//                 }

//                 validatedUpdates.firstName = firstName || null;
//             }

//             // ==================== LAST NAME VALIDATION ====================
//             if (updates.lastName !== undefined) {
//                 const lastName = updates.lastName?.trim();

//                 if (lastName && (lastName.length < 2 || lastName.length > 50)) {
//                     throw new Error('Last name must be 2-50 characters');
//                 }

//                 if (lastName && !/^[a-zA-Z\s\-']+$/.test(lastName)) {
//                     throw new Error('Last name can only contain letters, spaces, hyphens, and apostrophes');
//                 }

//                 validatedUpdates.lastName = lastName || null;
//             }

//             // ==================== LOCATION VALIDATION ====================
//             if (updates.location !== undefined) {
//                 const location = updates.location?.trim();

//                 if (location && (location.length < 2 || location.length > 50)) {
//                     throw new Error('Location must be 2-50 characters');
//                 }

//                 if (location && !/^[A-Z][a-zA-Z\s\-]{1,49}$/.test(location)) {
//                     throw new Error('Location must start with a capital letter');
//                 }

//                 validatedUpdates.location = location || null;
//             }

//             // ==================== ONBOARDING VALIDATION ====================
//             if (updates.onboarding !== undefined) {
//                 const userType = updates.onboarding.userType || currentUser.onboarding?.userType;

//                 if (!userType || !['working', 'student', 'fresher'].includes(userType)) {
//                     throw new Error('Invalid user type. Must be: working, student, or fresher');
//                 }

//                 const onboardingUpdates: any = {
//                     userType,
//                     completedAt: currentUser.onboarding?.completedAt || new Date(),
//                 };

//                 // Working profile validation
//                 if (userType === 'working' && updates.onboarding.workingProfile) {
//                     const wp = updates.onboarding.workingProfile;

//                     onboardingUpdates.workingProfile = {
//                         jobTitle: wp.jobTitle || currentUser.onboarding?.workingProfile?.jobTitle,
//                         companyName: wp.companyName || currentUser.onboarding?.workingProfile?.companyName,
//                         startDate: wp.startDate ? new Date(wp.startDate) : currentUser.onboarding?.workingProfile?.startDate,
//                         endDate: wp.endDate ? new Date(wp.endDate) : currentUser.onboarding?.workingProfile?.endDate,
//                     };

//                     // Validate dates
//                     if (onboardingUpdates.workingProfile.startDate > new Date()) {
//                         throw new Error('Start date cannot be in the future');
//                     }

//                     if (onboardingUpdates.workingProfile.endDate &&
//                         onboardingUpdates.workingProfile.endDate < onboardingUpdates.workingProfile.startDate) {
//                         throw new Error('End date must be after start date');
//                     }
//                 }

//                 // Student profile validation
//                 if (userType === 'student' && updates.onboarding.studentProfile) {
//                     const sp = updates.onboarding.studentProfile;

//                     onboardingUpdates.studentProfile = {
//                         collegeName: sp.collegeName || currentUser.onboarding?.studentProfile?.collegeName,
//                         degree: sp.degree || currentUser.onboarding?.studentProfile?.degree,
//                         fieldOfStudy: sp.fieldOfStudy || currentUser.onboarding?.studentProfile?.fieldOfStudy,
//                         graduationYear: sp.graduationYear || currentUser.onboarding?.studentProfile?.graduationYear,
//                     };

//                     // Validate graduation year
//                     if (onboardingUpdates.studentProfile.graduationYear) {
//                         const year = parseInt(onboardingUpdates.studentProfile.graduationYear);
//                         const currentYear = new Date().getFullYear();

//                         if (year < 1950 || year > currentYear + 10) {
//                             throw new Error('Invalid graduation year');
//                         }
//                     }
//                 }

//                 // Fresher profile validation
//                 if (userType === 'fresher' && updates.onboarding.fresherProfile) {
//                     const fp = updates.onboarding.fresherProfile;

//                     onboardingUpdates.fresherProfile = {
//                         highestEducation: fp.highestEducation || currentUser.onboarding?.fresherProfile?.highestEducation,
//                         preferredRole: fp.preferredRole || currentUser.onboarding?.fresherProfile?.preferredRole,
//                         cgpa: fp.cgpa || currentUser.onboarding?.fresherProfile?.cgpa,
//                     };

//                     // Validate CGPA format
//                     if (onboardingUpdates.fresherProfile.cgpa) {
//                         if (!/^\d{1,2}\.\d{2}$/.test(onboardingUpdates.fresherProfile.cgpa)) {
//                             throw new Error('CGPA must be in format X.XX (e.g., 8.50)');
//                         }

//                         const cgpaValue = parseFloat(onboardingUpdates.fresherProfile.cgpa);
//                         if (cgpaValue < 0 || cgpaValue > 10) {
//                             throw new Error('CGPA must be between 0.00 and 10.00');
//                         }
//                     }
//                 }

//                 validatedUpdates.onboarding = onboardingUpdates;

//                 LoggerUtil.debug('Onboarding update validated', {
//                     userId,
//                     userType,
//                     correlationId
//                 });
//             }

//             // ==================== PREFERENCES VALIDATION ====================
//             if (updates.preferences) {
//                 validatedUpdates.preferences = {
//                     ...currentUser.preferences,
//                     ...updates.preferences,
//                 };

//                 LoggerUtil.debug('Preferences update validated', {
//                     userId,
//                     correlationId
//                 });
//             }

//             // ✅ Step 4: Update in database
//             validatedUpdates.updatedAt = new Date();

//             LoggerUtil.info('Updating user in database', {
//                 userId,
//                 fieldsToUpdate: Object.keys(validatedUpdates),
//                 correlationId
//             });

//             const updatedUser = await User.findOneAndUpdate(
//                 { userId, 'flags.isDeleted': false },
//                 { $set: validatedUpdates },
//                 {
//                     new: true,
//                     runValidators: true,
//                     select: '-passwordHash -passwordSalt -backupCodes -twoFactorSecret -__v'
//                 }
//             ).lean();

//             if (!updatedUser) {
//                 throw new Error('User not found or update failed');
//             }

//             LoggerUtil.info('Database update successful', {
//                 userId,
//                 updatedFields: Object.keys(validatedUpdates),
//                 correlationId
//             });

//             // ✅ Step 5: Invalidate all user caches
//             try {
//                 await Promise.all([
//                     CacheUtil.del(`user:profile:${userId}`),
//                     CacheUtil.del(`${Constants.CACHE_PREFIXES.USER}${userId}`),
//                     CacheUtil.clearByPattern(`session:user:${userId}:*`),
//                     CacheUtil.clearByPattern(`user:*:${userId}:*`),
//                 ]);

//                 LoggerUtil.debug('Cache invalidated', { userId, correlationId });
//             } catch (cacheError: any) {
//                 LoggerUtil.warn('Cache invalidation failed (non-critical)', {
//                     error: cacheError.message,
//                     userId,
//                     correlationId
//                 });
//             }

//             // ✅ Step 6: Audit log (non-blocking)
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: 'USER_PROFILE_UPDATED',
//                     ipAddress,
//                     status: 'SUCCESS',
//                     severity: 'LOW',
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         updatedFields: Object.keys(validatedUpdates),
//                         hasEmailChange: !!updates.email,
//                         hasPasswordChange: !!updates.password,
//                         hasPhoneChange: !!updates.phoneNumber,
//                         correlationId,
//                     },
//                 }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
//             });

//             LoggerUtil.info('User profile updated successfully', {
//                 userId,
//                 updatedFields: Object.keys(validatedUpdates),
//                 correlationId
//             });

//             // ✅ Step 7: Return formatted response
//             return {
//                 userId: updatedUser.userId,
//                 email: updatedUser.email,
//                 phoneNumber: updatedUser.phoneNumber,
//                 firstName: updatedUser.firstName,
//                 lastName: updatedUser.lastName,
//                 location: updatedUser.location,
//                 onboarding: updatedUser.onboarding,
//                 phoneVerified: updatedUser.phoneVerified,
//                 emailVerified: updatedUser.emailVerified,
//                 preferences: updatedUser.preferences,
//                 updatedAt: updatedUser.updatedAt,
//                 updatedFields: Object.keys(validatedUpdates),
//             };

//         } catch (error: any) {
//             LoggerUtil.error('Failed to update user profile', {
//                 error: error.message,
//                 stack: error.stack,
//                 userId,
//                 correlationId,
//             });
//             throw new Error(error.message || 'Failed to update profile');
//         }
//     }

//     /**
//      * Deactivate user account (soft delete)
//      * User can reactivate later
//      *
//      * @param {string} userId - User ID
//      * @param {string} ipAddress - Request IP
//      * @param {string} reason - Deactivation reason
//      * @returns {Promise<Object>} Confirmation
//      */
//     static async deactivateAccount(userId: string, ipAddress: string, reason: string = 'user_requested'): Promise<any> {
//         const correlationId = uuidv4();
//         try {
//             LoggerUtil.info('Deactivating account', { userId, reason, correlationId });
//             // ✅ Step 1: Check if user exists
//             const user = await User.findOne({ userId });
//             if (!user) {
//                 throw new Error('User not found');
//             }
//             if (user.status === 'inactive') {
//                 throw new Error('Account already deactivated');
//             }
//             // ✅ Step 2: Update user status
//             user.status = 'inactive';
//             user.metadata = user.metadata || {};
//             user.metadata.deactivatedAt = new Date();
//             user.metadata.deactivationReason = reason;
//             user.updatedAt = new Date();
//             await user.save();
//             // ✅ Step 3: Terminate all active sessions
//             await Session.updateMany(
//                 { userId, status: 'active' },
//                 {
//                     $set: {
//                         status: 'terminated',
//                         terminatedAt: new Date(),
//                         terminationReason: 'account_deactivated'
//                     }
//                 }
//             );
//             // ✅ Step 4: Deactivate all devices
//             await Device.updateMany(
//                 { userId, isActive: true },
//                 {
//                     $set: {
//                         isActive: false,
//                         lastSeenAt: new Date()
//                     }
//                 }
//             );
//             // ✅ Step 5: Clear all caches
//             await CacheUtil.clearByPattern(`user:*:${userId}`);
//             await CacheUtil.clearByPattern(`session:user:${userId}:*`);
//             // ✅ Step 6: Audit log (non-blocking)
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: 'ACCOUNT_DEACTIVATED',
//                     ipAddress,
//                     status: 'SUCCESS',
//                     severity: 'MEDIUM',
//                     timestamp: new Date().toISOString(),
//                     metadata: { reason, correlationId },
//                 }).catch((err: any) => LoggerUtil.error('Audit log failed', { error: err.message }));
//             });
//             LoggerUtil.info('Account deactivated successfully', { userId, correlationId });
//             return {
//                 success: true,
//                 message: 'Account deactivated successfully',
//                 userId,
//                 deactivatedAt: user.metadata.deactivatedAt,
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Failed to deactivate account', {
//                 error: error.message,
//                 userId,
//                 correlationId,
//             });
//             throw new Error(error.message || 'Failed to deactivate account');
//         }
//     }

//     // ==================== DELETE USER (ADMIN ONLY) ====================
//     /**
//      * Permanently delete user account (admin only)
//      * This is irreversible - use with caution!
//      *
//      * @param {string} userId - User ID to delete
//      * @param {string} adminId - Admin performing deletion
//      * @param {string} ipAddress - Request IP
//      * @param {string} reason - Deletion reason
//      * @returns {Promise<Object>} Confirmation
//      */
//     static async deleteUser(userId: string, adminId: string, ipAddress: string, reason: string): Promise<any> {
//         const correlationId = uuidv4();
//         try {
//             LoggerUtil.warn('ADMIN DELETE - Permanently deleting user', {
//                 userId,
//                 adminId,
//                 reason,
//                 correlationId
//             });
//             // ✅ Step 1: Verify user exists
//             const user = await User.findOne({ userId });
//             if (!user) {
//                 throw new Error('User not found');
//             }
//             // ✅ Step 2: Delete user record
//             await User.deleteOne({ userId });
//             // ✅ Step 3: Delete all sessions
//             const deletedSessions = await Session.deleteMany({ userId });
//             // ✅ Step 4: Delete all devices
//             const deletedDevices = await Device.deleteMany({ userId });
//             // ✅ Step 5: Clear all caches
//             await CacheUtil.clearByPattern(`user:*:${userId}`);
//             await CacheUtil.clearByPattern(`session:*:${userId}:*`);
//             await CacheUtil.clearByPattern(`device:*:${userId}:*`);
//             // ✅ Step 6: Critical audit log (MUST succeed)
//             await AuditProducer.sendAuditEvent({
//                 eventId: uuidv4(),
//                 userId: adminId,
//                 action: 'USER_DELETED_BY_ADMIN',
//                 ipAddress,
//                 status: 'SUCCESS',
//                 severity: 'CRITICAL',
//                 timestamp: new Date().toISOString(),
//                 metadata: {
//                     deletedUserId: userId,
//                     deletedEmail: user.email,
//                     reason,
//                     sessionsDeleted: deletedSessions.deletedCount,
//                     devicesDeleted: deletedDevices.deletedCount,
//                     correlationId,
//                 },
//             });
//             LoggerUtil.warn('User permanently deleted', {
//                 userId,
//                 adminId,
//                 correlationId
//             });
//             return {
//                 success: true,
//                 message: 'User deleted permanently',
//                 deletedUserId: userId,
//                 deletedEmail: user.email,
//                 deletedAt: new Date().toISOString(),
//                 stats: {
//                     sessionsDeleted: deletedSessions.deletedCount,
//                     devicesDeleted: deletedDevices.deletedCount,
//                 }
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Failed to delete user', {
//                 error: error.message,
//                 userId,
//                 adminId,
//                 correlationId,
//             });
//             // Critical audit log for failed deletion
//             await AuditProducer.sendAuditEvent({
//                 eventId: uuidv4(),
//                 userId: adminId,
//                 action: 'USER_DELETE_FAILED',
//                 ipAddress,
//                 status: 'FAILURE',
//                 severity: 'CRITICAL',
//                 timestamp: new Date().toISOString(),
//                 metadata: {
//                     targetUserId: userId,
//                     error: error.message,
//                     correlationId,
//                 },
//             }).catch((auditErr: any) =>
//                 LoggerUtil.error('Critical audit log failed', { error: auditErr.message })
//             );
//             throw new Error(error.message || 'Failed to delete user');
//         }
//     }

//     // ==================== HELPER: INVALIDATE USER CACHE ====================
//     /**
//      * Invalidate all caches related to a user
//      *
//      * @param {string} userId - User ID
//      * @returns {Promise<void>}
//      */
//     static async invalidateUserCache(userId: string): Promise<void> {
//         try {
//             await Promise.all([
//                 CacheUtil.del(`user:profile:${userId}`),
//                 CacheUtil.clearByPattern(`session:user:${userId}:*`),
//                 CacheUtil.clearByPattern(`device:user:${userId}:*`),
//             ]);
//             LoggerUtil.debug('User cache invalidated', { userId });
//         } catch (error: any) {
//             LoggerUtil.error('Failed to invalidate user cache', {
//                 error: error.message,
//                 userId,
//             });
//         }
//     }

//     /**
//      * Logout from current device/session
//      *
//      * @param {string} userId - User ID
//      * @param {string} sessionId - Session ID
//      * @param {string} deviceId - Device ID
//      * @param {string} accessToken - Access token
//      * @param {string} ipAddress - Request IP
//      * @param {string} correlationId - Correlation ID
//      * @returns {Promise<LogoutResult>} Logout result
//      */
//     static async logout(userId: string, sessionId: string, deviceId: string, accessToken: string, ipAddress: string, correlationId: string): Promise<LogoutResult> {
//         try {
//             LoggerUtil.info('Logout service started', {
//                 userId,
//                 sessionId,
//                 deviceId,
//                 hasAccessToken: !!accessToken,
//                 correlationId
//             });
//             // ============================================================
//             // STEP 1: ✅ BLACKLIST ACCESS TOKEN (Most Critical Step)
//             // ============================================================
//             if (accessToken) {
//                 const tokenTTL = 900; // 15 minutes (match JWT expiry)
//                 const blacklistKey = `blacklist:access:${accessToken}`;
//                 await CacheUtil.set(blacklistKey, 'true', tokenTTL);
//                 LoggerUtil.info('Access token blacklisted', {
//                     tokenPrefix: accessToken.substring(0, 20),
//                     ttl: tokenTTL,
//                     blacklistKey,
//                     userId,
//                     correlationId
//                 });

//                 // ✅ Verify blacklisting worked
//                 const isBlacklisted = await CacheUtil.exists(blacklistKey);
//                 if (!isBlacklisted) {
//                     LoggerUtil.warn('Token blacklist verification failed (cache issue) - proceeding anyway', {
//                         userId,
//                         tokenPrefix: accessToken.substring(0, 20),
//                         correlationId
//                     });
//                 }

//                 LoggerUtil.debug('Token blacklist verified', {
//                     userId,
//                     tokenPrefix: accessToken.substring(0, 20),
//                     correlationId
//                 });
//             } else {
//                 LoggerUtil.warn('No access token provided for blacklisting', {
//                     userId,
//                     sessionId,
//                     correlationId
//                 });
//             }
//             // ============================================================
//             // STEP 2: Terminate Session in Database (if sessionId provided)
//             // ============================================================
//             let session: any = null;
//             let refreshToken: string | null = null;
//             if (sessionId) {
//                 session = await Session.findOne({ sessionId, userId });
//                 if (!session) {
//                     LoggerUtil.warn('Session not found - proceeding with token blacklist only', {
//                         sessionId,
//                         userId,
//                         correlationId
//                     });
//                     // Don't throw error - token is already blacklisted
//                 } else {
//                     if (session.status === 'terminated') {
//                         LoggerUtil.warn('Session already terminated', {
//                             sessionId,
//                             userId,
//                             correlationId
//                         });
//                     } else {
//                         // Update session status
//                         session.status = 'terminated';
//                         session.terminatedAt = new Date();
//                         session.terminationReason = 'user_logout';
//                         // Store refresh token for blacklisting
//                         refreshToken = session.refreshToken;
//                         await session.save();
//                         LoggerUtil.info('Session terminated in database', {
//                             sessionId,
//                             userId,
//                             correlationId
//                         });
//                     }
//                 }
//             }
//             // ============================================================
//             // STEP 3: Blacklist Refresh Token (if available)
//             // ============================================================
//             if (refreshToken) {
//                 const refreshTTL = 7 * 24 * 60 * 60; // 7 days
//                 const refreshBlacklistKey = `blacklist:refresh:${refreshToken}`;
//                 await CacheUtil.set(refreshBlacklistKey, 'true', refreshTTL);
//                 LoggerUtil.info('Refresh token blacklisted', {
//                     tokenPrefix: refreshToken.substring(0, 20),
//                     ttl: refreshTTL,
//                     userId,
//                     correlationId
//                 });
//             }
//             // ============================================================
//             // STEP 4: Update Device Status
//             // ============================================================
//             if (deviceId) {
//                 try {
//                     const deviceUpdateResult = await Device.findOneAndUpdate(
//                         { deviceId, userId },
//                         {
//                             $set: {
//                                 lastSeenAt: new Date(),
//                                 isActive: false
//                             }
//                         },
//                         { new: true }
//                     );
//                     if (deviceUpdateResult) {
//                         LoggerUtil.info('Device deactivated', {
//                             deviceId,
//                             userId,
//                             correlationId
//                         });
//                     } else {
//                         LoggerUtil.warn('Device not found for deactivation', {
//                             deviceId,
//                             userId,
//                             correlationId
//                         });
//                     }
//                 } catch (deviceError: any) {
//                     LoggerUtil.error('Device update failed (non-critical)', {
//                         error: deviceError.message,
//                         deviceId,
//                         userId,
//                         correlationId
//                     });
//                     // Don't throw - continue with logout
//                 }
//             }
//             // ============================================================
//             // STEP 5: Clear All User Caches
//             // ============================================================
//             try {
//                 const cacheKeys = [
//                     `session:${sessionId}`,
//                     `user:session:${userId}:${sessionId}`,
//                     `user:profile:${userId}`,
//                     `${Constants.CACHE_PREFIXES?.USER}${userId}`,
//                     `${Constants.CACHE_PREFIXES?.SESSION}${sessionId}`,
//                 ].filter(Boolean);
//                 await Promise.all(cacheKeys.map(key => CacheUtil.del(key)));
//                 LoggerUtil.info('User caches cleared', {
//                     clearedKeys: cacheKeys.length,
//                     userId,
//                     correlationId
//                 });
//             } catch (cacheError: any) {
//                 LoggerUtil.error('Cache clear failed (non-critical)', {
//                     error: cacheError.message,
//                     userId,
//                     correlationId
//                 });
//                 // Don't throw - continue with logout
//             }
//             // ============================================================
//             // STEP 6: Update User Last Active Timestamp
//             // ============================================================
//             try {
//                 await User.findOneAndUpdate(
//                     { userId },
//                     {
//                         $set: {
//                             'metadata.lastActiveAt': new Date()
//                         }
//                     }
//                 );
//                 LoggerUtil.debug('User metadata updated', { userId, correlationId });
//             } catch (userUpdateError: any) {
//                 LoggerUtil.error('User metadata update failed (non-critical)', {
//                     error: userUpdateError.message,
//                     userId,
//                     correlationId
//                 });
//                 // Don't throw - continue with logout
//             }
//             // ============================================================
//             // STEP 7: Send Audit Log (Non-blocking)
//             // ============================================================
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: Constants.AUDIT_ACTIONS?.USER_LOGOUT || 'USER_LOGOUT',
//                     ipAddress,
//                     status: 'SUCCESS',
//                     severity: 'LOW',
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         sessionId,
//                         deviceId,
//                         tokenBlacklisted: !!accessToken,
//                         correlationId,
//                     },
//                 }).catch((err: any) => {
//                     LoggerUtil.error('Audit log failed', {
//                         error: err.message,
//                         userId,
//                         correlationId
//                     });
//                 });
//             });
//             // ============================================================
//             // STEP 8: Return Success Response
//             // ============================================================
//             const result: LogoutResult = {
//                 success: true,
//                 message: 'Logged out successfully',
//                 loggedOut: true,
//                 loggedOutAt: session?.terminatedAt || new Date(),
//                 tokenBlacklisted: !!accessToken,
//                 sessionTerminated: !!session,
//                 deviceDeactivated: !!deviceId,
//             };
//             LoggerUtil.info('Logout completed successfully', {
//                 userId,
//                 sessionId,
//                 result,
//                 correlationId
//             });
//             return result;
//         } catch (error: any) {
//             LoggerUtil.error('Logout service failed', {
//                 error: error.message,
//                 stack: error.stack,
//                 userId,
//                 sessionId,
//                 correlationId,
//             });
//             // Send failure audit log
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: 'LOGOUT_FAILED',
//                     ipAddress,
//                     status: 'FAILURE',
//                     severity: 'MEDIUM',
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         error: error.message,
//                         sessionId,
//                         correlationId,
//                     },
//                 }).catch((err: any) => {
//                     LoggerUtil.error('Audit log failed', { error: err.message });
//                 });
//             });
//             throw new Error(error.message || 'Logout failed');
//         }
//     }

//     /**
//      * Logout from all devices
//      *
//      * @param {string} userId - User ID
//      * @param {string} currentAccessToken - Current access token
//      * @param {string} ipAddress - Request IP
//      * @param {string} correlationId - Correlation ID
//      * @returns {Promise<LogoutAllResult>} Logout result
//      */
//     static async logoutAll(userId: string, currentAccessToken: string, ipAddress: string, correlationId: string): Promise<LogoutAllResult> {
//         try {
//             LoggerUtil.info('Logout all devices service started', {
//                 userId,
//                 hasCurrentToken: !!currentAccessToken,
//                 correlationId
//             });
//             let tokensBlacklisted = 0;
//             let sessionsTerminated = 0;
//             let devicesDeactivated = 0;
//             // ============================================================
//             // STEP 1: ✅ Blacklist Current Access Token FIRST
//             // ============================================================
//             if (currentAccessToken) {
//                 const currentBlacklistKey = `blacklist:access:${currentAccessToken}`;
//                 await CacheUtil.set(currentBlacklistKey, 'true', 900);
//                 tokensBlacklisted++;
//                 LoggerUtil.info('Current access token blacklisted', {
//                     tokenPrefix: currentAccessToken.substring(0, 20),
//                     userId,
//                     correlationId
//                 });
//                 // ✅ Verify blacklisting worked
//                 const isBlacklisted = await CacheUtil.exists(currentBlacklistKey);
//                 if (!isBlacklisted) {
//                     LoggerUtil.error('Current token blacklisting verification failed', {
//                         userId,
//                         correlationId
//                     });
//                     throw new Error('Failed to blacklist current token');
//                 }
//             }
//             // ============================================================
//             // STEP 2: Find All Active Sessions
//             // ============================================================
//             const activeSessions: any[] = await Session.find({
//                 userId,
//                 status: 'active'
//             });
//             if (activeSessions.length === 0) {
//                 LoggerUtil.warn('No active sessions found for logout all', {
//                     userId,
//                     correlationId
//                 });
//             } else {
//                 LoggerUtil.info('Found active sessions to terminate', {
//                     userId,
//                     sessionCount: activeSessions.length,
//                     correlationId
//                 });
//             }
//             // ============================================================
//             // STEP 3: Terminate All Sessions & Blacklist All Tokens
//             // ============================================================
//             for (const session of activeSessions) {
//                 try {
//                     // Update session status
//                     session.status = 'terminated';
//                     session.terminatedAt = new Date();
//                     session.terminationReason = 'logout_all_devices';
//                     await session.save();
//                     sessionsTerminated++;
//                     LoggerUtil.debug('Session terminated', {
//                         sessionId: session.sessionId,
//                         userId,
//                         correlationId
//                     });
//                     // Blacklist access token from session (if different from current)
//                     if (session.accessToken && session.accessToken !== currentAccessToken) {
//                         const sessionBlacklistKey = `blacklist:access:${session.accessToken}`;
//                         await CacheUtil.set(sessionBlacklistKey, 'true', 900);
//                         tokensBlacklisted++;
//                         LoggerUtil.debug('Session access token blacklisted', {
//                             sessionId: session.sessionId,
//                             tokenPrefix: session.accessToken.substring(0, 20),
//                             userId,
//                             correlationId
//                         });
//                     }
//                     // Blacklist refresh token from session
//                     if (session.refreshToken) {
//                         const refreshBlacklistKey = `blacklist:refresh:${session.refreshToken}`;
//                         await CacheUtil.set(refreshBlacklistKey, 'true', 7 * 24 * 60 * 60);
//                         tokensBlacklisted++;
//                         LoggerUtil.debug('Session refresh token blacklisted', {
//                             sessionId: session.sessionId,
//                             tokenPrefix: session.refreshToken.substring(0, 20),
//                             userId,
//                             correlationId
//                         });
//                     }
//                 } catch (sessionError: any) {
//                     LoggerUtil.error('Failed to terminate session (continuing)', {
//                         error: sessionError.message,
//                         sessionId: session.sessionId,
//                         userId,
//                         correlationId
//                     });
//                     // Continue with other sessions
//                 }
//             }
//             // ============================================================
//             // STEP 4: Deactivate All Devices
//             // ============================================================
//             try {
//                 const deviceUpdateResult = await Device.updateMany(
//                     { userId, isActive: true },
//                     {
//                         $set: {
//                             isActive: false,
//                             lastSeenAt: new Date()
//                         }
//                     }
//                 );
//                 devicesDeactivated = deviceUpdateResult.modifiedCount || 0;
//                 LoggerUtil.info('Devices deactivated', {
//                     userId,
//                     devicesDeactivated,
//                     correlationId
//                 });
//             } catch (deviceError: any) {
//                 LoggerUtil.error('Device deactivation failed (non-critical)', {
//                     error: deviceError.message,
//                     userId,
//                     correlationId
//                 });
//                 // Don't throw - continue
//             }
//             // ============================================================
//             // STEP 5: Clear All User Caches
//             // ============================================================
//             try {
//                 // Clear session caches
//                 for (const session of activeSessions) {
//                     await CacheUtil.del(`session:${session.sessionId}`);
//                     await CacheUtil.del(`user:session:${userId}:${session.sessionId}`);
//                 }
//                 // Clear user profile and related caches
//                 await Promise.all([
//                     CacheUtil.del(`user:profile:${userId}`),
//                     CacheUtil.del(`${Constants.CACHE_PREFIXES?.USER}${userId}`),
//                     CacheUtil.clearByPattern(`user:*:${userId}:*`),
//                 ]);
//                 LoggerUtil.info('User caches cleared', {
//                     userId,
//                     correlationId
//                 });
//             } catch (cacheError: any) {
//                 LoggerUtil.error('Cache clear failed (non-critical)', {
//                     error: cacheError.message,
//                     userId,
//                     correlationId
//                 });
//                 // Don't throw - continue
//             }
//             // ============================================================
//             // STEP 6: Update User Last Active Timestamp
//             // ============================================================
//             try {
//                 await User.findOneAndUpdate(
//                     { userId },
//                     {
//                         $set: {
//                             'metadata.lastActiveAt': new Date()
//                         }
//                     }
//                 );
//             } catch (userUpdateError: any) {
//                 LoggerUtil.error('User metadata update failed (non-critical)', {
//                     error: userUpdateError.message,
//                     userId,
//                     correlationId
//                 });
//             }
//             // ============================================================
//             // STEP 7: Send Audit Log (Non-blocking)
//             // ============================================================
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: 'LOGOUT_ALL_DEVICES',
//                     ipAddress,
//                     status: 'SUCCESS',
//                     severity: 'MEDIUM',
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         sessionsTerminated,
//                         tokensBlacklisted,
//                         devicesDeactivated,
//                         correlationId,
//                     },
//                 }).catch((err: any) => {
//                     LoggerUtil.error('Audit log failed', {
//                         error: err.message,
//                         userId,
//                         correlationId
//                     });
//                 });
//             });
//             // ============================================================
//             // STEP 8: Return Success Response
//             // ============================================================
//             const result: LogoutAllResult = {
//                 success: true,
//                 message: 'Logged out from all devices successfully',
//                 sessionsTerminated,
//                 tokensBlacklisted,
//                 devicesDeactivated,
//                 loggedOutAt: new Date(),
//             };
//             LoggerUtil.info('Logout all devices completed successfully', {
//                 userId,
//                 result,
//                 correlationId
//             });
//             return result;
//         } catch (error: any) {
//             LoggerUtil.error('Logout all devices service failed', {
//                 error: error.message,
//                 stack: error.stack,
//                 userId,
//                 correlationId,
//             });
//             // Send failure audit log
//             setImmediate(() => {
//                 AuditProducer.sendAuditEvent({
//                     eventId: uuidv4(),
//                     userId,
//                     action: 'LOGOUT_ALL_DEVICES_FAILED',
//                     ipAddress,
//                     status: 'FAILURE',
//                     severity: 'HIGH',
//                     timestamp: new Date().toISOString(),
//                     metadata: {
//                         error: error.message,
//                         correlationId,
//                     },
//                 }).catch((err: any) => {
//                     LoggerUtil.error('Audit log failed', { error: err.message });
//                 });
//             });
//             throw new Error(error.message || 'Failed to logout from all devices');
//         }
//     }

//     // ==================== 2. REFRESH ACCESS TOKEN ====================
//     /**
//      * Refresh access token using refresh token
//      * @param {string} refreshToken - Refresh token
//      * @param {string} ipAddress - IP address
//      * @param {string} deviceId - Device ID
//      * @returns {Promise<RefreshResult>} Session info
//      */
//     static async refreshAccessToken(refreshToken: string, ipAddress: string, deviceId: string): Promise<RefreshResult> {
//         try {
//             // Verify refresh token
//             const decoded = User.verifyToken(refreshToken, 'refresh');
//             // Find active session
//             const session = await Session.findOne({
//                 sessionId: decoded.sessionId,
//                 userId: decoded.userId,
//                 isActive: true
//             });
//             if (!session) {
//                 throw new Error('Session not found or expired');
//             }
//             // Device limit check (max 2 active devices per user)
//             const activeDevices = await Device.countDocuments({
//                 userId: decoded.userId,
//                 isActive: true
//             });
//             if (activeDevices > 2) {
//                 throw new Error('Device limit exceeded (max 2 active devices)');
//             }
//             // Update session activity
//             await Session.updateActivity(session._id);
//             LoggerUtil.info('Access token refreshed successfully', {
//                 userId: decoded.userId,
//                 sessionId: session._id,
//             });
//             return {
//                 sessionId: session._id,
//                 userId: decoded.userId
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Token refresh failed', {
//                 error: error.message,
//                 ipAddress,
//                 deviceId
//             });
//             throw error;
//         }
//     }

//     // ==================== 3. GET USER FOR VERIFICATION ====================
//     /**
//      * Get user data for verification processes
//      * @param {string} userId - User ID
//      * @returns {Promise<UserForVerification | null>} User data or null
//     */
//     static async getUserForVerification(userId: string): Promise<UserForVerification | null> {
//         try {
//             // ============================================================
//             // STEP 1: INPUT VALIDATION
//             // ============================================================
//             if (!userId) {
//                 logger.warn('getUserForVerification called without userId');
//                 return null;
//             }
//             logger.debug('Getting user for verification', {
//                 userId,
//                 source: 'getUserForVerification'
//             });
//             // ============================================================
//             // STEP 2: TRY CACHE FIRST (Performance Optimization)
//             // ============================================================
//             // Cache key format: "user:fa8b42a2-6e15-49e2-8a5a-9ab45758baaa"
//             const cacheKey = `user:${userId}`;
//             logger.debug('Checking cache for user', {
//                 cacheKey,
//                 userId
//             });
//             let cachedUser = await CacheUtil.get(cacheKey);
//             // ============================================================
//             // STEP 3: PROCESS CACHED DATA (if exists)
//             // ============================================================
//             if (cachedUser) {
//                 logger.debug('Cache hit for user', { userId });
//                 try {
//                     // Parse JSON string to object
//                     // Cache stores data as JSON string, we need object
//                     const parsed = typeof cachedUser === 'string'
//                         ? JSON.parse(cachedUser) // String -> Object
//                         : cachedUser; // Already object
//                     logger.debug('Parsed cached user', {
//                         userId: parsed.userId,
//                         status: parsed.status,
//                         hasEmail: !!parsed.email
//                     });
//                     // ✅ CRITICAL: Only return active users
//                     // Inactive/deleted users should not verify email
//                     if (parsed.status === 'active') {
//                         logger.info('User found in cache (active)', {
//                             userId,
//                             email: parsed.email,
//                             emailVerified: parsed.emailVerified
//                         });
//                         return parsed as UserForVerification;
//                     } else {
//                         logger.warn('User in cache but not active', {
//                             userId,
//                             status: parsed.status
//                         });
//                         // Continue to DB fetch (maybe status changed)
//                     }
//                 } catch (parseError: any) {
//                     // JSON parse failed - corrupted cache data
//                     logger.warn('Cache parse failed, fetching from DB', {
//                         error: parseError.message,
//                         userId,
//                         cachedData: cachedUser?.substring(0, 100) // Log first 100 chars
//                     });
//                     // Continue to DB fetch
//                 }
//             } else {
//                 logger.debug('Cache miss for user', { userId });
//             }
//             // ============================================================
//             // STEP 4: FETCH FROM DATABASE (Cache miss or invalid)
//             // ============================================================
//             logger.debug('Fetching user from MongoDB', { userId });
//             const user = await User.findOne({ userId })
//                 .select('userId email emailVerified phoneNumber phoneVerified firstName lastName status accountStatus')
//                 .lean() // Returns plain JS object (faster than Mongoose document)
//                 .exec();
//             // ============================================================
//             // STEP 5: HANDLE USER NOT FOUND
//             // ============================================================
//             if (!user) {
//                 logger.warn('User not found in database', {
//                     userId,
//                     operation: 'getUserForVerification'
//                 });
//                 return null;
//             }
//             logger.debug('User found in database', {
//                 userId: user.userId,
//                 email: user.email,
//                 status: user.status,
//                 accountStatus: user.accountStatus,
//                 emailVerified: user.emailVerified
//             });
//             // ============================================================
//             // STEP 6: VALIDATE USER STATUS
//             // ============================================================
//             // ✅ FIX #1: Check both status and accountStatus
//             if (user.status !== 'active') {
//                 logger.warn('User status not active', {
//                     userId,
//                     status: user.status
//                 });
//                 return null;
//             }
//             // ✅ FIX #2: Check accountStatus (locked/suspended)
//             if (user.accountStatus && user.accountStatus !== 'active') {
//                 logger.warn('User account not active', {
//                     userId,
//                     accountStatus: user.accountStatus
//                 });
//                 return null;
//             }
//             // ============================================================
//             // STEP 7: CACHE THE RESULT (For future requests)
//             // ============================================================
//             try {
//                 // Cache for 5 minutes (300 seconds)
//                 // Why 5 minutes? Balance between:
//                 // - Fast retrieval (cache hit)
//                 // - Fresh data (not too stale)
//                 await CacheUtil.set(
//                     cacheKey,
//                     JSON.stringify(user), // Store as JSON string
//                     300 // TTL: 5 minutes
//                 );
//                 logger.debug('User cached successfully', {
//                     userId,
//                     ttl: 300,
//                     cacheKey
//                 });
//             } catch (cacheError: any) {
//                 // Cache failure is non-critical
//                 // User data is already fetched from DB
//                 logger.warn('Cache set failed (non-critical)', {
//                     error: cacheError.message,
//                     userId
//                 });
//                 // Don't throw - continue execution
//             }
//             // ============================================================
//             // STEP 8: RETURN USER DATA
//             // ============================================================
//             logger.info('User verification data retrieved successfully', {
//                 userId: user.userId,
//                 email: user.email,
//                 emailVerified: user.emailVerified,
//                 source: 'database'
//             });
//             return user as UserForVerification;
//         } catch (error: any) {
//             // ============================================================
//             // STEP 9: ERROR HANDLING
//             // ============================================================
//             logger.error('Get user for verification failed', {
//                 error: error.message,
//                 stack: error.stack,
//                 userId,
//                 errorName: error.name
//             });
//             // Re-throw error to caller
//             // Caller (sendEmailVerificationLink) will handle response
//             throw error;
//         }
//     }

//     // ==================== 4. VERIFY EMAIL ====================
//     /**
//      * Mark user email as verified
//      * @param {string} userId - User ID
//      * @param {string} tokenHash - Token hash for cleanup (optional)
//      * @returns {Promise<Object>} Updated user
//      */
//     static async verifyEmail(userId: string, tokenHash: string | null = null): Promise<any> {
//         try {
//             // Find user
//             const user = await User.findOne({ userId });
//             if (!user) {
//                 throw new Error('User not found');
//             }
//             // Check if already verified
//             if (user.emailVerified) {
//                 LoggerUtil.info('Email already verified', { userId });
//                 return user;
//             }
//             // Update user
//             user.emailVerified = true;
//             user.emailVerificationToken = undefined;
//             user.emailVerificationExpires = undefined;
//             await user.save();
//             // Clear cache
//             await CacheUtil.del(`${Constants.CACHE_PREFIXES.USER}${userId}`);
//             // Delete token from cache if provided
//             if (tokenHash) {
//                 await CacheUtil.del(`email_verify_token:${tokenHash}`);
//             }
//             // Emit event
//             try {
//                 userEmitter.emit('user:email_verified', {
//                     userId,
//                     email: user.email
//                 });
//             } catch (emitError: any) {
//                 LoggerUtil.error('Event emission failed (non-critical)', {
//                     error: emitError.message
//                 });
//             }
//             LoggerUtil.info('Email verified successfully', {
//                 userId,
//                 email: user.email
//             });
//             return user;
//         } catch (error: any) {
//             LoggerUtil.error('Email verification failed', {
//                 error: error.message,
//                 userId
//             });
//             throw error;
//         }
//     }

//     // ==================== 5. GENERATE EMAIL VERIFICATION TOKEN ====================
//     /**
//      * Generate and store email verification token
//      * @param {string} userId - User ID
//      * @param {string} email - User email
//      * @param {'link' | 'otp'} type - 'link' or 'otp'
//      * @returns {Promise<EmailVerificationResult>} Token data
//      */
//     static async generateEmailVerificationToken(userId: string, email: string, type: 'link' | 'otp' = 'link'): Promise<EmailVerificationResult> {
//         try {
//             if (type === 'otp') {
//                 // Generate 6-digit OTP
//                 const otp = Math.floor(100000 + Math.random() * 900000).toString();
//                 const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
//                 // Store in cache (10 minutes)
//                 await CacheUtil.set(
//                     `email_verify_otp:${otpHash}`,
//                     JSON.stringify({
//                         userId,
//                         email,
//                         createdAt: Date.now(),
//                         type: 'otp'
//                     } as EmailVerificationTokenData),
//                     600
//                 );
//                 return {
//                     otp,
//                     expiryMinutes: 10
//                 };
//             } else {
//                 // Generate token (32 bytes = 64 hex chars)
//                 const token = crypto.randomBytes(32).toString('hex');
//                 const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
//                 // Store in cache (24 hours)
//                 await CacheUtil.set(
//                     `email_verify_token:${tokenHash}`,
//                     JSON.stringify({
//                         userId,
//                         email,
//                         createdAt: Date.now(),
//                         type: 'link'
//                     } as EmailVerificationTokenData),
//                     86400
//                 );
//                 return {
//                     token,
//                     verificationLink: `${process.env.FRONTEND_URL}/verify-email?token=${token}`,
//                     expiryHours: 24
//                 };
//             }
//         } catch (error: any) {
//             LoggerUtil.error('Token generation failed', {
//                 error: error.message,
//                 userId,
//                 type
//             });
//             throw error;
//         }
//     }

//     // ==================== 6. VERIFY EMAIL TOKEN/OTP ====================
//     /**
//      * Verify email token or OTP
//      * @param {string} tokenOrOtp - Verification token or OTP
//      * @param {'link' | 'otp'} type - 'link' or 'otp'
//      * @param {string} userId - User ID (required for OTP)
//      * @returns {Promise<EmailTokenResult>} Verification data
//      */
//     static async verifyEmailToken(tokenOrOtp: string, type: 'link' | 'otp' = 'link', userId: string | null = null): Promise<EmailTokenResult> {
//         try {
//             // Hash token/OTP
//             const hash = crypto.createHash('sha256').update(tokenOrOtp).digest('hex');
//             const cacheKey = type === 'otp'
//                 ? `email_verify_otp:${hash}`
//                 : `email_verify_token:${hash}`;
//             // Get from cache
//             const cachedData = await CacheUtil.get(cacheKey);
//             if (!cachedData) {
//                 throw new Error(`Invalid or expired ${type === 'otp' ? 'OTP' : 'token'}`);
//             }
//             // Parse data
//             const tokenData = typeof cachedData === 'string'
//                 ? JSON.parse(cachedData)
//                 : cachedData;
//             // Verify type
//             if (tokenData.type !== type) {
//                 throw new Error('Invalid verification type');
//             }
//             // For OTP, verify userId matches
//             if (type === 'otp' && userId && tokenData.userId !== userId) {
//                 throw new Error('OTP does not belong to this user');
//             }
//             return {
//                 userId: tokenData.userId,
//                 email: tokenData.email,
//                 tokenHash: hash
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Token verification failed', {
//                 error: error.message,
//                 type
//             });
//             throw error;
//         }
//     }

//     /**
//      * Verify email token and update user
//      * This method is called by verifyEmailFromLink controller
//      * @param {string} token - Verification token from URL
//      * @returns {Promise<EmailVerifyByLinkResult>} Verification result with user data
//      */
//     // static async verifyEmailbyLinkToken(token: string): Promise<EmailVerifyByLinkResult> {
//     //     try {
//     //         LoggerUtil.info('Starting email token verification', {
//     //             tokenPreview: token.substring(0, 8) + '...',
//     //         });
//     //         // Step 1: Hash the token to match stored hash
//     //         const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
//     //         const cacheKey = `email_verify_token:${tokenHash}`;
//     //         LoggerUtil.debug('Looking up token in cache', {
//     //             cacheKey: cacheKey.substring(0, 30) + '...',
//     //         });
//     //         // Step 2: Get token data from Redis
//     //         const cachedData = await CacheUtil.get(cacheKey);
//     //         if (!cachedData) {
//     //             LoggerUtil.warn('Token not found in cache', {
//     //                 tokenHash: tokenHash.substring(0, 16) + '...',
//     //             });
//     //             throw new Error('TOKEN_NOT_FOUND');
//     //         }
//     //         // Step 3: Parse token data
//     //         const tokenData = JSON.parse(cachedData);
//     //         const { userId, email, createdAt, type } = tokenData;
//     //         LoggerUtil.info('Token data retrieved', {
//     //             userId,
//     //             email,
//     //             type,
//     //             age: Date.now() - createdAt,
//     //         });
//     //         // Step 4: Validate token type
//     //         if (type !== 'link') {
//     //             LoggerUtil.error('Invalid token type', {
//     //                 expectedType: 'link',
//     //                 actualType: type,
//     //                 userId,
//     //             });
//     //             throw new Error('INVALID_TOKEN_TYPE');
//     //         }
//     //         // Step 5: Check token expiry (24 hours)
//     //         const tokenAge = Date.now() - createdAt;
//     //         const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
//     //         if (tokenAge > maxAge) {
//     //             LoggerUtil.warn('Token expired', {
//     //                 userId,
//     //                 email,
//     //                 tokenAge,
//     //                 maxAge,
//     //             });
//     //             // Delete expired token
//     //             await CacheUtil.delete(cacheKey);
//     //             throw new Error('TOKEN_EXPIRED');
//     //         }
//     //         // Step 6: Find user in database
//     //         const user = await User.findOne({ userId });
//     //         if (!user) {
//     //             LoggerUtil.error('User not found for verification', {
//     //                 userId,
//     //                 email,
//     //             });
//     //             throw new Error('USER_NOT_FOUND');
//     //         }
//     //         // Step 7: Check if already verified
//     //         if (user.emailVerified) {
//     //             LoggerUtil.info('Email already verified', {
//     //                 userId,
//     //                 email,
//     //                 verifiedAt: user.emailVerifiedAt,
//     //             });
//     //             // Still delete the token
//     //             await CacheUtil.delete(cacheKey);
//     //             return {
//     //                 success: true,
//     //                 alreadyVerified: true,
//     //                 user: {
//     //                     userId: user.userId,
//     //                     email: user.email,
//     //                     firstName: user.firstName || 'User',
//     //                     emailVerified: true,
//     //                     emailVerifiedAt: user.emailVerifiedAt,
//     //                 },
//     //             };
//     //         }
//     //         // Step 8: Update user in database
//     //         user.emailVerified = true;
//     //         user.emailVerifiedAt = new Date();
//     //         user.updatedAt = new Date();
//     //         await user.save();
//     //         LoggerUtil.info('✅ User email verified successfully', {
//     //             userId,
//     //             email,
//     //             emailVerifiedAt: user.emailVerifiedAt,
//     //         });
//     //         // Step 9: Delete used token from Redis
//     //         await CacheUtil.delete(cacheKey);
//     //         LoggerUtil.debug('Verification token deleted from cache', {
//     //             cacheKey: cacheKey.substring(0, 30) + '...',
//     //         });
//     //         // Step 10: Clear user cache to reflect changes
//     //         const userCacheKeys = [
//     //             `user:${userId}`,
//     //             `user:email:${email}`,
//     //             `user:verification:${userId}`,
//     //         ];
//     //         for (const key of userCacheKeys) {
//     //             await CacheUtil.delete(key);
//     //         }
//     //         LoggerUtil.debug('User cache cleared', {
//     //             userId,
//     //             clearedKeys: userCacheKeys.length,
//     //         });
//     //         // Step 11: Return success result
//     //         return {
//     //             success: true,
//     //             alreadyVerified: false,
//     //             user: {
//     //                 userId: user.userId,
//     //                 email: user.email,
//     //                 firstName: user.firstName || 'User',
//     //                 emailVerified: true,
//     //                 emailVerifiedAt: user.emailVerifiedAt,
//     //             },
//     //         };
//     //     } catch (error: any) {
//     //         LoggerUtil.error('Email token verification failed', {
//     //             error: error.message,
//     //             stack: error.stack,
//     //         });
//     //         // Throw with specific error codes
//     //         if (error.message === 'TOKEN_NOT_FOUND') {
//     //             throw new Error('Verification token not found or expired');
//     //         } else if (error.message === 'TOKEN_EXPIRED') {
//     //             throw new Error('Verification token has expired');
//     //         } else if (error.message === 'USER_NOT_FOUND') {
//     //             throw new Error('User account not found');
//     //         } else if (error.message === 'INVALID_TOKEN_TYPE') {
//     //             throw new Error('Invalid verification token');
//     //         } else {
//     //             throw new Error('Email verification failed');
//     //         }
//     //     }
//     // }

//     // ==================== 7. SEND VERIFICATION EMAIL ====================

//     /**
//      * Send verification email (link or OTP)
//      * @param {string} email - User email
//      * @param {string} firstName - User first name
//      * @param {any} verificationData - Token/OTP data
//      * @param {'link' | 'otp'} type - 'link' or 'otp'
//      * @returns {Promise<boolean>} Success status
//      */
//     static async sendVerificationEmail(email: string, firstName: string, verificationData: any, type: 'link' | 'otp' = 'link'): Promise<boolean> {
//         try {
//             const template = type === 'otp' ? 'email-otp' : 'email-otp';
//             const subject = type === 'otp'
//                 ? 'Your Email Verification Code - Throne8'
//                 : 'Verify Your Email Address - Throne8';
//             await NotificationService.sendEmail({
//                 to: email,
//                 subject,
//                 template,
//                 data: {
//                     firstName: firstName || 'User',
//                     userEmail: email,
//                     ...verificationData
//                 }
//             });
//             LoggerUtil.info('Verification email sent successfully', {
//                 email,
//                 type
//             });
//             return true;
//         } catch (error: any) {
//             LoggerUtil.error('Email sending failed', {
//                 error: error.message,
//                 email,
//                 type
//             });
//             throw error;
//         }
//     }

//     // ==================== 8. CHECK RATE LIMIT ====================
//     /**
//      * Check and increment rate limit
//      * @param {string} key - Rate limit key
//      * @param {number} limit - Max attempts
//      * @param {number} ttl - Time to live (seconds)
//      * @returns {Promise<RateLimitResult>} Rate limit status
//      */
//     static async checkRateLimit(key: string, limit: number = 3, ttl: number = 3600): Promise<RateLimitResult> {
//         try {
//             const attemptCount = parseInt(await CacheUtil.get(key) as string) || 0;
//             if (attemptCount >= limit) {
//                 return {
//                     allowed: false,
//                     remainingAttempts: 0,
//                     retryAfter: ttl
//                 };
//             }
//             // Increment counter
//             await CacheUtil.set(key, attemptCount + 1, ttl);
//             return {
//                 allowed: true,
//                 remainingAttempts: limit - (attemptCount + 1),
//                 attempts: attemptCount + 1
//             };
//         } catch (error: any) {
//             LoggerUtil.error('Rate limit check failed', {
//                 error: error.message,
//                 key
//             });
//             throw error;
//         }
//     }

//     // ==================== 9. CLEAR RATE LIMIT ====================
//     /**
//      * Clear rate limit counter
//      * @param {string} key - Rate limit key
//      * @returns {Promise<boolean>} Success status
//      */
//     static async clearRateLimit(key: string): Promise<boolean> {
//         try {
//             await CacheUtil.del(key);
//             return true;
//         } catch (error: any) {
//             LoggerUtil.error('Rate limit clear failed', {
//                 error: error.message,
//                 key
//             });
//             return false;
//         }
//     }

//     // ==================== 10. VERIFY PHONE ====================
//     /**
//      * Mark user phone as verified
//      * @param {string} userId - User ID
//      * @param {string} phoneNumber - Phone number
//      * @returns {Promise<Object>} Updated user
//      */
//     static async verifyPhone(userId: string, phoneNumber: string): Promise<any> {
//         try {
//             const user = await User.findOne({ userId });
//             if (!user) {
//                 throw new Error('User not found');
//             }
//             if (user.phoneVerified) {
//                 LoggerUtil.info('Phone already verified', { userId });
//                 return user;
//             }
//             // Update user
//             user.phoneNumber = phoneNumber;
//             user.phoneVerified = true;
//             user.phoneVerifiedAt = new Date();
//             await user.save();
//             // Clear cache
//             await CacheUtil.del(`${Constants.CACHE_PREFIXES.USER}${userId}`);
//             // Emit event
//             try {
//                 userEmitter.emit('user:phone_verified', {
//                     userId,
//                     phoneNumber
//                 });
//             } catch (emitError: any) {
//                 LoggerUtil.error('Event emission failed (non-critical)', {
//                     error: emitError.message
//                 });
//             }
//             LoggerUtil.info('Phone verified successfully', {
//                 userId,
//                 phoneNumber
//             });
//             return user;
//         } catch (error: any) {
//             LoggerUtil.error('Phone verification failed', {
//                 error: error.message,
//                 userId
//             });
//             throw error;
//         }
//     }

//     // ==================== 11. GENERATE PHONE OTP ====================
//     /**
//      * Generate and store phone verification OTP
//      * @param {string} userId - User ID
//      * @param {string} phoneNumber - Phone number
//      * @returns {Promise<PhoneOTPResult>} OTP data
//      */
//     // static async generatePhoneOTP(userId: string, phoneNumber: string): Promise<PhoneOTPResult> {
//     //     try {
//     //         // Create MFA token for phone verification
//     //         const otpData = await MFAToken.createToken(
//     //             userId,
//     //             'sms',
//     //             'phone_verification',
//     //             { ttl: 600 }
//     //         );
//     //         // Store in cache (10 minutes)
//     //         await CacheUtil.set(
//     //             `phone_otp:${userId}`,
//     //             JSON.stringify({
//     //                 otpHash: otpData.hashedToken,
//     //                 phoneNumber,
//     //                 attempts: 0,
//     //                 createdAt: Date.now()
//     //             }),
//     //             600
//     //         );
//     //         return {
//     //             otp: otpData.token,
//     //             expiryMinutes: 10
//     //         };
//     //     } catch (error: any) {
//     //         LoggerUtil.error('Phone OTP generation failed', {
//     //             error: error.message,
//     //             userId
//     //         });
//     //         throw error;
//     //     }
//     // }

//     // ==================== 12. VERIFY PHONE OTP ====================


//     /**
//      * Verify phone OTP
//      * @param {string} userId - User ID
//      * @param {string} otp - OTP code
//      * @returns {Promise<PhoneVerificationResult>} Verification result with phone number
//      */
//     // static async verifyPhoneOTP(userId: string, otp: string): Promise<PhoneVerificationResult> {
//     //     try {
//     //         // Get cached OTP data
//     //         const cachedData = await CacheUtil.get(`phone_otp:${userId}`);
//     //         if (!cachedData) {
//     //             throw new Error('OTP expired or not found');
//     //         }
//     //         const otpData = JSON.parse(cachedData);
//     //         // Check attempt limit
//     //         if (otpData.attempts >= 3) {
//     //             await CacheUtil.del(`phone_otp:${userId}`);
//     //             throw new Error('Too many failed attempts. Please request a new OTP.');
//     //         }
//     //         // Verify OTP
//     //         const otpHash = crypto
//     //             .createHash('sha256')
//     //             .update(otp + process.env.MFA_TOKEN_SALT)
//     //             .digest('hex');
//     //         if (otpHash !== otpData.otpHash) {
//     //             // Increment attempts
//     //             otpData.attempts += 1;
//     //             await CacheUtil.set(`phone_otp:${userId}`, JSON.stringify(otpData), 600);
//     //             throw new Error(`Invalid OTP. ${3 - otpData.attempts} attempts remaining.`);
//     //         }
//     //         // Success - delete OTP from cache
//     //         await CacheUtil.del(`phone_otp:${userId}`);
//     //         return {
//     //             verified: true,
//     //             phoneNumber: otpData.phoneNumber
//     //         };
//     //     } catch (error: any) {
//     //         LoggerUtil.error('Phone OTP verification failed', {
//     //             error: error.message,
//     //             userId
//     //         });
//     //         throw error;
//     //     }
//     // }

//     // ==================== 13. SEND PHONE OTP SMS ====================
//     /**
//      * Send OTP via SMS
//      * @param {string} phoneNumber - Phone number with country code
//      * @param {string} otp - OTP code
//      * @returns {Promise<boolean>} Success status
//      */
//     // static async sendPhoneOTP(phoneNumber: string, otp: string): Promise<boolean> {
//     //     try {
//     //         await NotificationService.sendSMS({
//     //             to: phoneNumber,
//     //             message: `Your Throne8 verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`
//     //         });
//     //         LoggerUtil.info('Phone OTP sent successfully', {
//     //             phoneNumber: phoneNumber.substring(0, 6) + '****'
//     //         });
//     //         return true;
//     //     } catch (error: any) {
//     //         LoggerUtil.error('SMS sending failed', {
//     //             error: error.message,
//     //             phoneNumber: phoneNumber.substring(0, 6) + '****'
//     //         });
//     //         throw error;
//     //     }
//     // }
// }

// export default AuthService;