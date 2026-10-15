/**
 * auth.service.ts
 * Business logic only. Saari DB/cache access repositories ke through,
 * saare types interfaces/types files se.
 *
 * Version notes:
 * - login(): ek hi user fetch, ek hi rate-limit pass, full user data return
 *   (controller ko dobara user fetch nahi karna padta).
 * - Lock: 5 failed attempts par 15 min ka temporary lock (pehle 24h, 3 attempts).
 * - Public endpoints (getUserById, getUsersByIds) sirf public fields return karte hain.
 * - updateUserProfile: email/password yahan se nahi badalte.
 * - Email OTP: per-user scoped, attempt limit ke saath.
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
import { User, Contact } from '@/shared/models/index.models';

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
import {
    duplicateEmailError,
    duplicateKeyConflict,
    duplicatePhoneError,
    normalizeEmail,
    normalizePhone,
    phoneLookupVariants,
    RegistrationConflictError,
    RegistrationFieldError,
} from '../utils/registrationIdentity';

// ==================== CONSTANTS ====================

const MAX_FAILED_ATTEMPTS = 5;               // ek user + IP ke liye (15 min window)
const MAX_FAILED_ATTEMPTS_PER_IP = 20;       // ek IP ke liye (campus/NAT ka dhyan rakha)
const LOCK_DURATION_MS = 15 * 60 * 1000;     // temporary lock
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_SECONDS = 600;
const MAX_BULK_USER_IDS = 100;

const PUBLIC_PROFILE_SELECT =
    'userId firstName lastName location coverPhotoId profilePhotoId headlineId aboutId ' +
    'companyId experienceIds activityStats onboarding role emailVerified createdAt';

const parseCached = (value: any): any =>
    typeof value === 'string' ? JSON.parse(value) : value;

const sha256 = (value: string): string =>
    crypto.createHash('sha256').update(value).digest('hex');

const safeEqualHex = (a: string, b: string): boolean => {
    try {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    } catch {
        return false;
    }
};

// ==================== AUTH SERVICE ====================

class AuthService {

    /**
     * Kept for backward compatibility. login() ab ye sab khud karta hai,
     * isliye controller ko ise alag se call nahi karna chahiye.
     */
    static async checkAccountLocked(
        email: string,
        ipAddress: string
    ): Promise<boolean> {
        try {
            const ipAttempts = await LoginAttemptRepository.countRecentByIp(ipAddress);
            if (ipAttempts >= MAX_FAILED_ATTEMPTS_PER_IP) {
                logger.warn('IP blocked after too many attempts', { ipAddress });
                return true;
            }

            const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
                'userId accountStatus lockUntil'
            );
            if (!user) return false;

            if (user.accountStatus === 'locked') {
                logger.warn('Account locked', { userId: user.userId });
                return true;
            }

            if (user.lockUntil && user.lockUntil > new Date()) {
                logger.warn('Account temporarily locked', { userId: user.userId });
                return true;
            }

            const userAttempts = await LoginAttemptRepository.countRecentByUserAndIp(
                user.userId,
                ipAddress
            );
            return userAttempts >= MAX_FAILED_ATTEMPTS;

        } catch (error: any) {
            logger.error('Account lock check failed', {
                error: error.message,
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
        let createdUserId: string | null = null;

        try {
            email = normalizeEmail(email || '');
            const phoneNumber = profileData.phoneNumber
                ? normalizePhone(profileData.phoneNumber)
                : undefined;

            const [existingEmail, existingPhone] = await Promise.all([
                User.findOne({ email })
                    .collation({ locale: 'en', strength: 2 })
                    .select('userId')
                    .lean()
                    .exec(),
                phoneNumber
                    ? User.findOne({
                        phoneNumber: { $in: phoneLookupVariants(phoneNumber) },
                    }).select('userId').lean().exec()
                    : Promise.resolve(null),
            ]);
            const fieldErrors: RegistrationFieldError[] = [];
            if (existingEmail) fieldErrors.push(duplicateEmailError);
            if (existingPhone) fieldErrors.push(duplicatePhoneError);
            if (fieldErrors.length) throw new RegistrationConflictError(fieldErrors);

            // Build user document
            const user = new User({
                email,
                passwordHash: password,
                ...(phoneNumber ? { phoneNumber } : {}),
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
                firstName: profileData.firstName,
                location: profileData.location,
                userType: profileData.userType,
            });

            await user.save();
            createdUserId = user.userId;

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

            // Audit log (phone number store nahi karte, sirf flag)
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
                    ['hasPhoneNumber', String(!!user.phoneNumber)],
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
            // User save ho chuka tha par aage kuch fail hua: orphan user hata do,
            // warna dobara register karne par "User already exists" aayega.
            if (createdUserId) {
                await UserRepository.deleteByUserId(createdUserId).catch((cleanupErr: any) =>
                    logger.error('Registration rollback failed', {
                        error: cleanupErr?.message,
                        userId: createdUserId,
                    })
                );
            }

            const conflict = error instanceof RegistrationConflictError
                ? error
                : duplicateKeyConflict(error);
            if (conflict) throw conflict;

            logger.error('User registration failed', { error: error.message });
            throw error;
        }
    }

    // ==================== LOGIN ====================

    /**
     * Single user fetch, single rate-limit pass. Full user fields return hote hain
     * taaki controller ko dobara DB nahi jaana pade.
     */
    static async login(
        email: string,
        password: string,
        ipAddress: string,
        deviceData: DeviceData = {}
    ): Promise<LoginResult & {
        email: string;
        role: string;
        firstName?: string;
        lastName?: string;
        profilePhotoId?: string;
        headlineId?: string;
    }> {
        let userId: string | null = null;

        try {
            email = (email || '').trim().toLowerCase();
            logger.info('Login process started', { email, ipAddress });

            // Step 1: IP-level check + user fetch parallel
            const [ipAttempts, user] = await Promise.all([
                LoginAttemptRepository.countRecentByIp(ipAddress),
                UserRepository.findByEmailWithPassword(email),
            ]);

            if (ipAttempts >= MAX_FAILED_ATTEMPTS_PER_IP) {
                logger.warn('IP blocked after too many attempts', { ipAddress });
                await LoginAttemptRepository.recordSafe(null, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'ip_blocked',
                    metadata: { email, reason: 'ip_rate_limited' },
                });
                throw new Error('Too many attempts from this IP. Please try again later.');
            }

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

            if (user.lockUntil && user.lockUntil > new Date()) {
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'account_temporarily_locked',
                    metadata: { reason: 'lock_until_active' },
                });
                throw new Error(
                    'Too many attempts. Account temporarily locked, please try again in 15 minutes.'
                );
            }

            if (
                user.status === 'deleted' ||
                user.status === 'suspended' ||
                user.status === 'inactive'
            ) {
                throw new Error('Account is not active. Contact support.');
            }

            // Step 3: Rate limit check (sirf failed attempts count hote hain)
            const recentAttempts = await LoginAttemptRepository.countRecentByUserAndIp(
                user.userId,
                ipAddress
            );

            if (recentAttempts >= MAX_FAILED_ATTEMPTS) {
                logger.warn('Login blocked: Too many attempts', {
                    userId,
                    attempts: recentAttempts,
                });
                await LoginAttemptRepository.recordSafe(userId, ipAddress, 'login', 'blocked', {
                    userAgent: deviceData.userAgent,
                    failureReason: 'rate_limited',
                    metadata: { attempts: recentAttempts },
                });
                try {
                    await User.lockAccount(
                        user.userId,
                        'too_many_attempts',
                        LOCK_DURATION_MS
                    );
                } catch (lockErr: any) {
                    logger.error('Temporary lock failed (non-critical)', {
                        error: lockErr.message,
                        userId,
                    });
                }
                throw new Error(
                    'Too many attempts. Account temporarily locked, please try again in 15 minutes.'
                );
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

            // Purane (expire ho chuke) lock fields saaf karo
            if (user.lockUntil || user.accountLockedReason) {
                User.updateOne(
                    { userId: user.userId },
                    {
                        $unset: { lockUntil: 1, accountLockedReason: 1 },
                        $set: { loginAttempts: 0 },
                    }
                ).catch((err: any) =>
                    logger.error('Lock reset failed (non-critical)', {
                        error: err.message,
                        userId,
                    })
                );
            }

            // Step 5: Last login update (fire-and-forget)
            user.updateLastLogin(ipAddress).catch((err: any) =>
                logger.error('updateLastLogin failed (non-critical)', {
                    error: err.message,
                    userId,
                })
            );

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

            // Step 8: Success record (fire-and-forget)
            LoginAttemptRepository.recordSafe(
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
            ).catch((err: any) =>
                logger.error('recordSafe(success) failed (non-critical)', {
                    error: err.message,
                    userId,
                })
            );

            logger.info('Login successful', { userId, sessionId: session._id });

            return {
                userId: user.userId,
                sessionId: session._id,
                deviceId: device.deviceId,
                email: user.email,
                role: user.role || 'user',
                firstName: user.firstName,
                lastName: user.lastName,
                profilePhotoId: user.profilePhotoId,
                headlineId: user.headlineId,
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

            // Sirf verified email se link/create karo (unverified email se account takeover ho sakta hai)
            const emailEntry =
                githubProfile.emails?.find((e: any) => e.primary && e.verified !== false) ||
                githubProfile.emails?.find((e: any) => e.verified !== false);
            const email = emailEntry?.value?.trim().toLowerCase();

            if (!email) {
                throw new Error('No verified email found in GitHub profile');
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

            // Existing user: GitHub link karo agar already linked nahi
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
                    email,
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
     * Unique username generate karo (helper)
     */
    private static async generateUniqueUsername(base: string): Promise<string> {
        const cleanBase = base.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        let username = cleanBase;
        let counter = 1;

        while (await UserRepository.usernameExists(username)) {
            username = `${cleanBase}_${counter}`;
            counter++;

            // Bahut collisions ho to random suffix lagao, infinite loop se bachne ke liye
            if (counter > 50) {
                username = `${cleanBase}_${crypto.randomBytes(3).toString('hex')}`;
                break;
            }
        }

        return username;
    }

    // ==================== GET USER PROFILE (SELF) ====================

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

            // hasDateOfBirth
            const contact = await Contact.findOne({ userId }).select('birthday').lean();
            if (contact && contact.birthday && contact.birthday.day && contact.birthday.month) {
                profile.hasDateOfBirth = true;
            } else {
                profile.hasDateOfBirth = false;
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

    // ==================== GET USER BY ID (PUBLIC VIEW) ====================

    /**
     * Doosre users ko dikhne wala PUBLIC profile. email, phone, IP, sessions,
     * preferences yahan kabhi nahi aate. Self/admin ke liye controller
     * getUserProfile() call karta hai.
     */
    static async getUserById(
        userId: string,
        _options: ProfileOptions = {}
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching user by ID', { userId, correlationId });

            const uuidRegex =
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(userId)) {
                throw new Error('Invalid user ID format');
            }

            // L1: Cache (ye key ab sirf public profile hold karti hai)
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

            const userResponse = this.buildPublicProfile(user);

            const contact = await Contact.findOne({ userId }).select('birthday').lean();
            if (contact && contact.birthday && contact.birthday.day && contact.birthday.month) {
                userResponse.hasDateOfBirth = true;
            } else {
                userResponse.hasDateOfBirth = false;
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

    // ==================== GET USERS BY IDS (BULK, PUBLIC VIEW) ====================

    /**
     * Ek hi query mein multiple users (public fields). N parallel getUserById
     * calls se hone wale 429 errors ko rokta hai.
     */
    static async getUsersByIds(userIds: string[]): Promise<any[]> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching users in bulk', {
                count: userIds?.length,
                correlationId,
            });

            if (!Array.isArray(userIds) || userIds.length === 0) {
                return [];
            }

            const uniqueIds = [
                ...new Set(userIds.filter((id) => typeof id === 'string' && id.length > 0)),
            ].slice(0, MAX_BULK_USER_IDS);

            if (uniqueIds.length === 0) return [];

            const users = await User.find({
                userId: { $in: uniqueIds },
                status: 'active',
                'flags.isDeleted': false,
            })
                .select(PUBLIC_PROFILE_SELECT)
                .lean();

            const formattedUsers = users.map((user: any) =>
                this.buildPublicProfile(user)
            );

            LoggerUtil.info('Bulk users fetched successfully', {
                requested: uniqueIds.length,
                found: formattedUsers.length,
                correlationId,
            });

            return formattedUsers;

        } catch (error: any) {
            LoggerUtil.error('Failed to fetch users in bulk', {
                error: error.message,
                correlationId,
            });
            throw new Error(error.message || 'Failed to fetch users');
        }
    }

    // ==================== PROFILE BUILDERS ====================

    /**
     * Public view: sirf wahi jo doosre users ko dikhna chahiye.
     */
    private static buildPublicProfile(user: any): Record<string, any> {
        return {
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            location: user.location,
            coverPhotoId: user.coverPhotoId,
            profilePhotoId: user.profilePhotoId,
            headlineId: user.headlineId,
            aboutId: user.aboutId,
            companyId: user.companyId,
            experienceIds: user.experienceIds,
            activityStats: {
                totalPosts: user.activityStats?.totalPosts || 0,
                totalComments: user.activityStats?.totalComments || 0,
                totalVideos: user.activityStats?.totalVideos || 0,
                totalImages: user.activityStats?.totalImages || 0,
                totalDocuments: user.activityStats?.totalDocuments || 0,
            },
            onboarding: this.buildOnboardingSection(user.onboarding),
            role: user.role,
            emailVerified: !!user.emailVerified,
            createdAt: user.createdAt,
        };
    }

    /**
     * Full view: sirf user ke apne profile (ya admin) ke liye.
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
     * userType ke hisaab se onboarding section
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

    // ==================== GET ALL USERS (ADMIN) ====================

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

            const formattedUsers = users.map((user: any) => ({
                userId: user.userId,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName || null,
                fullName: user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.firstName,
                location: user.location || null,
                profilePhotoId: user.profilePhotoId || null,
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

            // Password yahan se kabhi nahi badalta (verified change flow use karo)
            if (updates.password !== undefined) {
                throw new Error(
                    'Password cannot be changed here. Please use the change password option.'
                );
            }

            // Email: same email ignore, alag email reject (verified change flow use karo)
            if (updates.email !== undefined) {
                const requestedEmail = updates.email?.trim().toLowerCase();
                const currentEmail = (
                    await User.findOne({ userId }).select('email').lean()
                )?.email;
                if (requestedEmail && requestedEmail !== currentEmail) {
                    throw new Error(
                        'Email cannot be changed here. Please use the verified email change option.'
                    );
                }
            }

            const allowedFields = [
                'phoneNumber', 'firstName', 'lastName', 'location',
                'onboarding', 'preferences', 'currentPosition',
                'company', 'education', 'pronouns',
            ];

            const updateFields = Object.keys(updates).filter((k) =>
                allowedFields.includes(k)
            );
            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            const currentUser: any = await User.findOne({
                userId,
                'flags.isDeleted': false,
            })
                .select('email phoneNumber preferences onboarding')
                .lean()
                .exec();
            if (!currentUser) throw new Error('User not found');

            const validatedUpdates: any = {};

            // Phone number (verification sirf tab reset hota hai jab number sach mein badle)
            if (updates.phoneNumber !== undefined) {
                const phoneNumber = updates.phoneNumber?.trim();
                if (phoneNumber && !validator.isMobilePhone(phoneNumber, 'any')) {
                    throw new Error(
                        'Invalid phone number format (use E.164 format, e.g., +919876543210)'
                    );
                }
                const nextPhone = phoneNumber || null;
                if (nextPhone !== (currentUser.phoneNumber || null)) {
                    validatedUpdates.phoneNumber = nextPhone;
                    validatedUpdates.phoneVerified = false;
                    validatedUpdates.phoneVerifiedAt = null;
                }
            }

            // First name
            if (updates.firstName !== undefined) {
                const firstName = updates.firstName?.trim();
                if (firstName && firstName.length > 50) {
                    throw new Error('First name cannot exceed 50 characters');
                }
                validatedUpdates.firstName = firstName || null;
            }

            // Last name
            if (updates.lastName !== undefined) {
                const lastName = updates.lastName?.trim();
                if (lastName && lastName.length > 50) {
                    throw new Error('Last name cannot exceed 50 characters');
                }
                validatedUpdates.lastName = lastName || null;
            }

            // Location
            if (updates.location !== undefined) {
                const location = updates.location?.trim();
                if (location && location.length > 100) {
                    throw new Error('Location cannot exceed 100 characters');
                }
                validatedUpdates.location = location || null;
            }

            // Current Position
            if (updates.currentPosition !== undefined) {
                const currentPosition = updates.currentPosition?.trim();
                if (currentPosition && currentPosition.length > 100) {
                    throw new Error('Current position cannot exceed 100 characters');
                }
                validatedUpdates.currentPosition = currentPosition || null;
            }

            // Company
            if (updates.company !== undefined) {
                const company = updates.company?.trim();
                if (company && company.length > 100) {
                    throw new Error('Company name cannot exceed 100 characters');
                }
                validatedUpdates.company = company || null;
            }

            // Education
            if (updates.education !== undefined) {
                const education = updates.education?.trim();
                if (education && education.length > 150) {
                    throw new Error('Education cannot exceed 150 characters');
                }
                validatedUpdates.education = education || null;
            }

            // Pronouns
            if (updates.pronouns !== undefined) {
                const pronouns = updates.pronouns?.trim();
                const validPronouns = ['He/Him', 'She/Her', 'They/Them', 'Other'];
                if (pronouns && !validPronouns.includes(pronouns)) {
                    throw new Error('Pronouns must be one of: He/Him, She/Her, They/Them, Other');
                }
                validatedUpdates.pronouns = pronouns || null;
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
                        onboardingUpdates.workingProfile.endDate <=
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
            await AuthCacheRepository.del(`verify:user:${userId}`);

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
                        hasPhoneChange: 'phoneNumber' in validatedUpdates,
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
                currentPosition: updatedUser.currentPosition,
                company: updatedUser.company,
                education: updatedUser.education,
                pronouns: updatedUser.pronouns,
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
            await AuthCacheRepository.del(`verify:user:${userId}`);

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

            await Promise.all([
                SessionRepository.terminateAllForUser(userId, 'user_logout'),
                DeviceRepository.deleteAllForUser(userId),
            ]);

            await AuthCacheRepository.invalidateUserCaches(userId);
            await AuthCacheRepository.del(`verify:user:${userId}`);

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

    /**
     * Note: actual refresh flow AuthController.refreshToken() mein hai (rotation +
     * reuse detection). Ye method backward compatibility ke liye rakha hai.
     * Device limit yahan nahi lagta; wo auth middleware handle karta hai.
     */
    static async refreshAccessToken(
        refreshToken: string,
        ipAddress: string,
        deviceId: string
    ): Promise<RefreshResult> {
        try {
            const decoded = User.verifyToken(refreshToken, 'refresh');
            const { sessionId, userId } = decoded;

            if (!sessionId || !userId) {
                throw new Error('Invalid refresh token payload');
            }

            const session = await SessionRepository.findSession(
                sessionId,
                userId
            );

            if (!session) {
                throw new Error('Session not found or expired');
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

            // Apna alag cache namespace ("verify:user:<userId>")
            const cached = await AuthCacheRepository.getCachedVerificationUser(userId);

            if (cached && cached.status === 'active') {
                return cached as UserForVerification;
            }

            // DB fallback
            const user = await UserRepository.findForVerification(userId);
            if (!user) return null;

            // Cache result
            try {
                await AuthCacheRepository.setCachedVerificationUser(userId, user, 300);
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
            user.emailVerifiedAt = new Date();
            user.emailVerificationToken = undefined;
            user.emailVerificationExpires = undefined;
            await user.save();

            // Saare user-related caches saaf karo (profile, public, verification)
            await AuthCacheRepository.invalidateUserCaches(userId);
            await AuthCacheRepository.del(`verify:user:${userId}`);
            await AuthCacheRepository.del(
                `${Constants.CACHE_PREFIXES.USER}${userId}`
            );

            // Used token/OTP keys hata do (dobara use na ho sake)
            await AuthCacheRepository.del(`email_verify_otp_user:${userId}`);
            await AuthCacheRepository.del(`email_verify_otp_attempts:${userId}`);
            if (tokenHash) {
                await AuthCacheRepository.del(`email_verify_token:${tokenHash}`);
                await AuthCacheRepository.del(`email_verify_otp:${tokenHash}`);
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
                const otp = crypto.randomInt(100000, 1000000).toString();
                const otpHash = sha256(otp);

                const data: EmailVerificationTokenData = {
                    userId,
                    email,
                    createdAt: Date.now(),
                    type: 'otp',
                };

                // Per-user scoped record (verification yahin se hoti hai jab userId pata ho)
                await AuthCacheRepository.set(
                    `email_verify_otp_user:${userId}`,
                    JSON.stringify({ ...data, otpHash }),
                    OTP_TTL_SECONDS
                );

                // Legacy hash-keyed record (sirf un callers ke liye jo userId pass nahi karte)
                await AuthCacheRepository.set(
                    `email_verify_otp:${otpHash}`,
                    JSON.stringify(data),
                    OTP_TTL_SECONDS
                );

                // Naya OTP = attempts counter reset
                await AuthCacheRepository.del(`email_verify_otp_attempts:${userId}`);

                return { otp, expiryMinutes: OTP_TTL_SECONDS / 60 };
            } else {
                const token = crypto.randomBytes(32).toString('hex');
                const tokenHash = sha256(token);

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

    /**
     * OTP verify karte waqt userId hamesha pass karo (controller mein req.user se).
     * userId diya ho to per-user record + 5 attempts ki limit lagti hai.
     */
    static async verifyEmailToken(
        tokenOrOtp: string,
        type: VerificationType = 'link',
        userId: string | null = null
    ): Promise<EmailTokenResult> {
        try {
            const hash = sha256(tokenOrOtp);

            // OTP + userId: scoped, attempt-limited path
            if (type === 'otp' && userId) {
                const attemptsKey = `email_verify_otp_attempts:${userId}`;
                const attempts = await AuthCacheRepository.getRateLimit(attemptsKey);

                if (attempts >= MAX_OTP_ATTEMPTS) {
                    throw new Error('Too many invalid attempts. Please request a new code.');
                }

                const scopedRaw = await AuthCacheRepository.get(
                    `email_verify_otp_user:${userId}`
                );
                const scoped = scopedRaw ? parseCached(scopedRaw) : null;

                if (!scoped || !scoped.otpHash || !safeEqualHex(scoped.otpHash, hash)) {
                    await AuthCacheRepository.setRateLimit(
                        attemptsKey,
                        attempts + 1,
                        OTP_TTL_SECONDS
                    );
                    throw new Error('Invalid or expired OTP');
                }

                await AuthCacheRepository.del(attemptsKey);

                return {
                    userId: scoped.userId,
                    email: scoped.email,
                    tokenHash: hash,
                };
            }

            // Link token ya legacy OTP (userId ke bina)
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

            const tokenData = parseCached(cachedData);

            if (tokenData.type !== type) {
                throw new Error('Invalid verification type');
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

            // Saare user-related caches saaf karo (profile, public, verification)
            await AuthCacheRepository.invalidateUserCaches(userId);
            await AuthCacheRepository.del(`verify:user:${userId}`);
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
        await AuthCacheRepository.del(`verify:user:${userId}`);
    }
}

export default AuthService;