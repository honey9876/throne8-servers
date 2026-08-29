import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import { LoggerUtil } from '@/shared/logger.util';
import userEmitter from '@/shared/events/emitters/user.emitter';
import Constants from '@/shared/constants.util';
import CacheUtil from '@/shared/cache.util';
import { IUserBadge } from '@/StudyGroup/interfaces/IBadge';

const logger = LoggerUtil;

export interface IUser extends Document {
    userId: string;
    email: string;
    username?: string;
    passwordHash: string;
    passwordSalt?: string;
    firstName: string;
    lastName?: string;
    dateOfBirth?: Date;
    location?: string;
    currentPosition?: string;
    company?: string;
    education?: string;
    pronouns?: string;
    analyticsId?: string;
    profilePhotoId?: string;
    coverPhotoId?: string;
    experienceIds: string[];
    careerBreakIds: string[];
    testScoreIds: string[];
    addSkillsIds?: string[];
    volunteerIds: string[];
    patentId?: string;
    companyId?: string;
    honorId?: string;
    publicationId?: string;
    positionIds: string[];
    totalExperienceYears: number;
    coursesIds: string[];
    projects: string[];
    headlineId?: string;
    activityIds: {
        postIds: string[];
        commentIds: string[];
        videoIds: string[];
        imageIds: string[];
        documentIds: string[];
    };
    activityStats: {
        totalPosts: number;
        totalComments: number;
        totalVideos: number;
        totalImages: number;
        totalDocuments: number;
    };
    activityPattern?: {
        activeHours: number[];
        peakEngagementTime: string;
        lastUpdated: Date;
    };
    accountType: 'personal' | 'company' | 'creator';
    companyDetails: {
        companyName: string;
        industry: string;
        size: string;
        verified: boolean;
    };
    skillIds: string[];
    contactId?: string;
    aboutId?: string;
    onboarding?: {
        userType: 'working' | 'student' | 'fresher';
        completedAt: Date;
        workingProfile?: {
            jobTitle: string;
            companyName: string;
            startDate: Date;
            endDate?: Date;
        };
        studentProfile?: {
            collegeName: string;
            degree: string;
            fieldOfStudy: string;
            graduationYear: string;
        };
        fresherProfile?: {
            highestEducation: string;
            preferredRole: string;
            cgpa?: string;
        };
    };
    role: 'user' | 'admin' | 'moderator' | 'mentor';
    status: 'active' | 'inactive' | 'suspended' | 'deleted';
    accountStatus?: 'active' | 'locked' | 'disabled';
    emailVerified: boolean;
    emailVerificationToken?: string;
    emailVerificationExpires?: Date;
    phoneNumber?: string;
    phoneVerified: boolean;
    aadhaarVerified: boolean;
    aadhaarVerifiedAt?: Date;
    aadhaarLast4?: string;
    companyEmailVerified: boolean;
    companyEmailVerifiedAt?: Date;
    companyEmail?: string;
    twoFactorEnabled: boolean;
    twoFactorSecret?: string;
    backupCodes?: string[];
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    passwordChangedAt?: Date;
    lastLoginAt?: Date;
    lastLoginIp?: string;
    loginAttempts: number;
    lockUntil?: Date;
    accountLockedReason?: 'too_many_attempts' | 'suspicious_activity' | 'admin_action' | 'security_breach';
    oauthProviders?: IOAuthProvider[];
    emailVerifiedAt?: Date;
    phoneVerifiedAt?: Date;
    lastPasswordReVerificationAt?: Date;
    lastIdentityReCheckAt?: Date;
    jobStatus: string;
    jobProfileLastUpdated?: Date;
    preferences: IUserPreferences;
    metadata: IUserMetadata;
    flags: IUserFlags;
    demographics: {
        industry?: string;
        seniority?: string;
        companySize?: string;
        location?: string;
        ageGroup?: string;
    };
    audienceInsights: {
        primaryAudience?: string;
        engagementPattern?: string;
        followerGrowthRate: number;
    };
    badges?: IUserBadge[];
    createdAt: Date;
    updatedAt: Date;
    fullName: string;
    isLocked: boolean;
    incrementLoginAttempts(): Promise<any>;
    resetLoginAttempts(): Promise<any>;
    trackActivityTime(): Promise<void>;
    generateEmailVerificationToken(): string;
    generatePasswordResetToken(): string;
    verifyEmail(): Promise<IUser>;
    updateLastLogin(ipAddress: string): Promise<IUser>;
    softDelete(deletedBy?: string): Promise<IUser>;
    findByUsername(username: string): Promise<(IUser & Document) | null>;
}

interface IUserJSON {
    [key: string]: any;
}

interface IOAuthProvider {
    provider: 'google' | 'facebook' | 'github' | 'apple';
    providerId: string;
    accessToken?: string;
    refreshToken?: string;
    connectedAt: Date;
}

interface IUserPreferences {
    language: string;
    timezone: string;
    notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
    };
    theme: 'light' | 'dark' | 'auto';
    // Controls whether "who viewed your profile" notifications name the viewer
    // ('named'), hide identity but still track ('public'/'connections' — reserved
    // for future granularity), or disable view tracking entirely ('private').
    profileViewVisibility?: 'named' | 'public' | 'connections' | 'private';
}

interface IUserMetadata {
    registrationIp?: string;
    registrationDevice?: string;
    lastActiveAt?: Date;
    totalLogins: number;
    failedLoginAttempts: number;
    deactivatedAt?: Date;
    deactivationReason?: string;
}

interface IUserFlags {
    isDeleted: boolean;
    deletedAt?: Date;
    deletedBy?: string;
}

// 🔧 NAYA — search result ke return shape ke liye
interface IPaginatedUsersResult {
    data: any[];
    totalCount: number;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    estimatedTotal?: number;
}

export interface IUserModel extends Model<IUser> {
    generateAccessToken(payload: TokenPayload): string;
    generateRefreshToken(payload: TokenPayload): string;
    verifyToken(token: string, tokenType?: 'access' | 'refresh'): TokenPayload;
    lockAccount(userId: string, reason?: string): Promise<IUser>;
    unlockAccount(userId: string): Promise<IUser>;
    syncJobStatus(userId: string, jobStatus: string): Promise<void>;
    findByEmail(email: string): Promise<IUser | null>;
    findByUsername(username: string): Promise<(IUser & Document) | null>;
    findByUserId(userId: string): Promise<IUser | null>;
    getActiveUserCount(): Promise<number>;
    // 🔧 NAYA — search ke liye
    findUsersPaginated(options: {
        page: number;
        limit: number;
        query: string;
        region?: string;
        useEstimatedCount?: boolean;
        projection?: string;
    }): Promise<IPaginatedUsersResult>;
}

interface TokenPayload {
    userId: string;
    role: string;
    sessionId?: string;
    deviceId?: string;
    iat?: number;
    exp?: number;
}

const JWT_CONFIG = {
    accessToken: {
        secret: (process.env['JWT_ACCESS_SECRET'] || 'your-access-secret-key-change-in-production') as jwt.Secret,
        expiresIn: '15m' as const,
    },
    refreshToken: {
        secret: (process.env['JWT_REFRESH_SECRET'] || 'your-refresh-secret-key-change-in-production') as jwt.Secret,
        expiresIn: '30d' as const,
    },
} as const;

const UserSchema = new Schema<IUser, IUserModel>(
    {
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            validate: [validator.isEmail, 'Invalid email format'],
        },
        username: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
            minlength: [3, 'Username must be at least 3 characters'],
            maxlength: [30, 'Username cannot exceed 30 characters'],
            match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'],
        },
        passwordHash: {
            type: String,
            required: function (this: IUser) {
                return !this.oauthProviders || this.oauthProviders.length === 0;
            },
            select: false,
        },
        passwordSalt: {
            type: String,
            required: false,
            select: false,
        },
        firstName: {
            type: String,
            trim: true,
            required: true,
            minlength: [2, 'First name must be at least 2 characters'],
            maxlength: [50, 'First name cannot exceed 50 characters'],
        },
        lastName: {
            type: String,
            trim: true,
            maxlength: [50, 'Last name cannot exceed 50 characters'],
        },
        dateOfBirth: {
            type: Date,
            default: null,
        },
        location: {
            type: String,
            trim: true,
            required: false,
            minlength: [2, 'Location must be at least 2 characters'],
            maxlength: [50, 'Location cannot exceed 50 characters'],
            validate: {
                validator: function (v: string) {
                    return !v || /^[A-Z][a-zA-Z\s\-]{1,49}$/.test(v);
                },
                message: 'Location must start with a capital letter',
            },
        },



        currentPosition: {
            type: String,
            trim: true,
            default: null,
            maxlength: [100, 'Current position cannot exceed 100 characters'],
        },
        company: {
            type: String,
            trim: true,
            default: null,
            maxlength: [100, 'Company name cannot exceed 100 characters'],
        },
        education: {
            type: String,
            trim: true,
            default: null,
            maxlength: [150, 'Education cannot exceed 150 characters'],
        },
        pronouns: {
            type: String,
            trim: true,
            default: null,
            enum: {
                values: ['He/Him', 'She/Her', 'They/Them', 'Other', null],
                message: 'Pronouns must be one of: He/Him, She/Her, They/Them, Other',
            },
        },



        profilePhotoId: {
            type: String,
            default: null,
            validate: {
                validator: function (v: string) {
                    return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
                },
                message: 'Invalid Profile Photo ID format',
            },
        },
        coverPhotoId: {
            type: String,
            default: null,
            validate: {
                validator: function (v: string) {
                    return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
                },
                message: 'Invalid Cover Photo ID format',
            },
        },
        experienceIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid Experience ID format',
            },
        },
        careerBreakIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid Career Break ID format',
            },
        },
        testScoreIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid Test Score ID format',
            },
        },
        addSkillsIds: {
            type: [String],
            default: [],
            validate: {
                validator: (arr: string[]) =>
                    arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
                message: 'Invalid skill ID format in addSkillsIds',
            },
        },
        volunteerIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr: string[]) {
                    return arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid volunteer ID format in array',
            },
        },
        positionIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid Position ID format',
            },
        },
        totalExperienceYears: {
            type: Number,
            default: 0,
        },
        patentId: {
            type: String,
            default: null,
            validate: {
                validator: (v: string) =>
                    !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid Patent ID format',
            },
        },
        honorId: {
            type: String,
            default: null,
            validate: {
                validator: (v: string) =>
                    !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid Honor ID format',
            },
        },
        companyId: {
            type: String,
            default: null,
            validate: {
                validator: function (v: string) {
                    return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
                },
                message: 'Invalid Company ID format',
            },
        },
        publicationId: {
            type: String,
            default: null,
            validate: {
                validator: (v: string) =>
                    !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid Publication ID format',
            },
        },
        coursesIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (arr: string[]) {
                    return arr.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid course ID format in array',
            },
        },
        projects: [{ type: String, ref: 'Project' }],
        headlineId: {
            type: String,
            default: null,
            ref: 'Headline',
        },
        analyticsId: {
            type: String,
            default: null,
            validate: {
                validator: function (v: string) {
                    return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
                },
                message: 'Invalid Analytics ID format',
            },
        },
        activityIds: {
            postIds: [{ type: String }],
            commentIds: [{ type: String }],
            videoIds: [{ type: String }],
            imageIds: [{ type: String }],
            documentIds: [{ type: String }],
        },
        activityStats: {
            totalPosts: { type: Number, default: 0 },
            totalComments: { type: Number, default: 0 },
            totalVideos: { type: Number, default: 0 },
            totalImages: { type: Number, default: 0 },
            totalDocuments: { type: Number, default: 0 },
        },
        activityPattern: {
            activeHours: {
                type: [Number],
                default: [],
                validate: {
                    validator: (v: number[]) => v.every(h => h >= 0 && h < 24),
                    message: 'Invalid hour value',
                },
            },
            peakEngagementTime: { type: String, default: 'not-set' },
            lastUpdated: { type: Date, default: Date.now },
        },
        accountType: {
            type: String,
            enum: ['personal', 'company', 'creator'],
            default: 'personal',
        },
        companyDetails: {
            companyName: { type: String, default: null },
            industry: { type: String, default: null },
            size: { type: String, default: null },
            verified: { type: Boolean, default: false },
        },
        skillIds: {
            type: [String],
            default: [],
            validate: {
                validator: function (v: string[]) {
                    return v.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
                },
                message: 'Invalid Skill ID format',
            },
        },
        contactId: {
            type: String,
            default: null,
            ref: 'Contact',
            validate: {
                validator: function (v: string) {
                    return !v || /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
                },
                message: 'Invalid Contact ID format',
            },
        },
        aboutId: {
            type: String,
            default: null,
            ref: 'About',
        },
        onboarding: {
            userType: {
                type: String,
                enum: ['working', 'student', 'fresher'],
            },
            completedAt: { type: Date, default: Date.now },
            workingProfile: {
                jobTitle: { type: String },
                companyName: { type: String },
                startDate: Date,
                endDate: Date,
            },
            studentProfile: {
                collegeName: { type: String },
                degree: { type: String },
                fieldOfStudy: { type: String },
                graduationYear: { type: String },
            },
            fresherProfile: {
                highestEducation: { type: String },
                preferredRole: { type: String },
                cgpa: String,
            },
        },
        role: {
            type: String,
            enum: ['user', 'admin', 'moderator', 'mentor'],
            default: 'user',
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'suspended', 'deleted'],
            default: 'active',
        },
        accountStatus: {
            type: String,
            enum: ['active', 'locked', 'disabled'],
            default: 'active',
        },
        emailVerified: { type: Boolean, default: false },
        emailVerificationToken: { type: String, select: false },
        emailVerificationExpires: { type: Date, select: false },
        phoneNumber: {
            type: String,
            validate: {
                validator: function (v: string) {
                    return !v || validator.isMobilePhone(v);
                },
                message: 'Invalid phone number format',
            },
        },
        phoneVerified: { type: Boolean, default: false },
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String, select: false },
        backupCodes: { type: [String], select: false },
        passwordResetToken: { type: String, select: false },
        passwordResetExpires: { type: Date, select: false },
        passwordChangedAt: Date,
        lastLoginAt: Date,
        lastLoginIp: String,
        loginAttempts: { type: Number, default: 0 },
        lockUntil: Date,
        accountLockedReason: {
            type: String,
            enum: ['too_many_attempts', 'suspicious_activity', 'admin_action', 'security_breach'],
        },
        oauthProviders: [
            {
                provider: { type: String, enum: ['google', 'facebook', 'github', 'apple'] },
                providerId: String,
                accessToken: { type: String, select: false },
                refreshToken: { type: String, select: false },
                connectedAt: { type: Date, default: Date.now },
            },
        ],
        emailVerifiedAt: { type: Date },
        phoneVerifiedAt: { type: Date },
        lastPasswordReVerificationAt: { type: Date },
        lastIdentityReCheckAt: { type: Date },
        aadhaarVerified: { type: Boolean, default: false },
        aadhaarVerifiedAt: { type: Date },
        aadhaarLast4: { type: String, select: false, maxlength: 4 },
        companyEmailVerified: { type: Boolean, default: false },
        companyEmailVerifiedAt: { type: Date },
        companyEmail: { type: String, lowercase: true, trim: true },
        jobStatus: {
            type: String,
            enum: [
                'working',
                'student',
                'intern',
                'fresher',
                'looking-for-job',
                'not-looking-for-job',
                'freelancer',
                'experienced-professional',
                'unemployed',
                'career-break',
                'retired',
                'not-set',
            ],
            default: 'not-set',
        },
        jobProfileLastUpdated: { type: Date },
        preferences: {
            language: { type: String, default: 'en', enum: ['en', 'es', 'fr', 'de', 'hi', 'ja', 'zh'] },
            timezone: { type: String, default: 'UTC' },
            notifications: {
                email: { type: Boolean, default: true },
                push: { type: Boolean, default: true },
                sms: { type: Boolean, default: false },
            },
            theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
            profileViewVisibility: {
                type: String,
                enum: ['named', 'public', 'connections', 'private'],
                default: 'named',
            },
        },
        metadata: {
            registrationIp: String,
            registrationDevice: String,
            lastActiveAt: Date,
            totalLogins: { type: Number, default: 0 },
            failedLoginAttempts: { type: Number, default: 0 },
            deactivatedAt: Date,
            deactivationReason: String,
        },
        flags: {
            isDeleted: { type: Boolean, default: false },
            deletedAt: Date,
            deletedBy: String,
        },
        demographics: {
            industry: String,
            seniority: String,
            companySize: String,
            location: String,
            ageGroup: String,
        },
        audienceInsights: {
            primaryAudience: String,
            engagementPattern: String,
            followerGrowthRate: { type: Number, default: 0 },
        },
        badges: [
            {
                badge: { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
                earnedAt: { type: Date, default: Date.now },
                progress: { type: Number, default: 0 },
                isCompleted: { type: Boolean, default: false },
            },
        ],
    },
    {
        timestamps: true,
        collection: 'users',
        shardKey: { userId: 'hashed' },
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret: IUserJSON) {
                delete ret.passwordHash;
                delete ret.passwordSalt;
                delete ret.twoFactorSecret;
                delete ret.backupCodes;
                delete ret.emailVerificationToken;
                delete ret.passwordResetToken;
                delete ret.__v;
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================
// NOTE: Sirf compound aur unique indexes yahan hain
// Single-field indexes upar field definition mein  se handle hote hain

UserSchema.index({ dateOfBirth: 1, status: 1 });
UserSchema.index({ 'onboarding.workingProfile.startDate': 1, status: 1 });
UserSchema.index({ email: 1, status: 1 });
UserSchema.index({ userId: 1, emailVerified: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ location: 1, status: 1 });
UserSchema.index({ location: 1, 'onboarding.userType': 1 });
UserSchema.index({ 'onboarding.userType': 1, createdAt: -1 });
UserSchema.index({ location: 1, 'onboarding.userType': 1, status: 1, createdAt: -1 });

// 🔧 NAYA — full-text search index (name, username, email, company, location)
UserSchema.index(
    { firstName: 'text', lastName: 'text', username: 'text', email: 'text', company: 'text', location: 'text' },
    {
        name: 'user_search_text_index',
        weights: { firstName: 10, lastName: 8, username: 6, company: 4, location: 3, email: 2 },
    }
);

UserSchema.virtual('fullName').get(function (this: IUser) {
    return this.firstName && this.lastName ? `${this.firstName} ${this.lastName}` : this.email;
});

UserSchema.virtual('isLocked').get(function (this: IUser) {
    return !!(this.lockUntil && this.lockUntil > new Date());
});

UserSchema.pre('save', async function (next) {
    if (!this.isModified('passwordHash')) return next();
    try {
        if (this.passwordHash && this.passwordHash.startsWith('$2')) return next();
        const salt = await bcrypt.genSalt(12);
        this.passwordSalt = salt;
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error: any) {
        logger.error('Password hashing failed', { error: (error as Error).message });
        next(error as Error);
    }
});

UserSchema.statics.generateAccessToken = function (payload: TokenPayload): string {
    try {
        return jwt.sign(payload, JWT_CONFIG.accessToken.secret, { expiresIn: JWT_CONFIG.accessToken.expiresIn });
    } catch (error: any) {
        logger.error('Access token generation failed', { error: (error as Error).message });
        throw new Error('Token generation failed');
    }
};

UserSchema.statics.generateRefreshToken = function (payload: TokenPayload): string {
    try {
        return jwt.sign(payload, JWT_CONFIG.refreshToken.secret, { expiresIn: JWT_CONFIG.refreshToken.expiresIn });
    } catch (error: any) {
        logger.error('Refresh token generation failed', { error: (error as Error).message });
        throw new Error('Token generation failed');
    }
};

UserSchema.statics.verifyToken = function (token: string, tokenType: 'access' | 'refresh' = 'access'): TokenPayload {
    try {
        const config = tokenType === 'refresh' ? JWT_CONFIG.refreshToken : JWT_CONFIG.accessToken;
        return jwt.verify(token, config.secret) as TokenPayload;
    } catch (error: any) {
        logger.warn(`Token verification failed (${tokenType})`, { error: (error as Error).message });
        throw new Error(`Invalid or expired ${tokenType} token`);
    }
};

UserSchema.statics.lockAccount = async function (userId: string, reason: string = 'admin_action'): Promise<IUser> {
    try {
        const user = await this.findOne({ userId });
        if (!user) throw new Error('User not found');
        user.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        user.accountLockedReason = reason as any;
        await user.save();
        userEmitter.emit('user:locked', { userId, reason, timestamp: new Date() });
        return user;
    } catch (error: any) {
        logger.error('Account lock failed', { error: (error as Error).message, userId });
        throw error;
    }
};

UserSchema.statics.unlockAccount = async function (userId: string): Promise<IUser> {
    try {
        const user = await this.findOneAndUpdate(
            { userId },
            { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1, accountLockedReason: 1 } },
            { new: true }
        );
        if (!user) throw new Error('User not found');
        userEmitter.emit('user:unlocked', { userId, timestamp: new Date() });
        return user;
    } catch (error: any) {
        logger.error('Account unlock failed', { error: (error as Error).message, userId });
        throw error;
    }
};

UserSchema.statics.syncJobStatus = async function (userId: string, jobStatus: string): Promise<void> {
    try {
        await this.findOneAndUpdate(
            { userId },
            { $set: { jobStatus, jobProfileLastUpdated: new Date() } }
        );
    } catch (error: any) {
        logger.error('Job status sync failed', { error: (error as Error).message, userId });
    }
};

UserSchema.statics.findByEmail = async function (email: string): Promise<IUser | null> {
    return this.findOne({ email: email.toLowerCase(), 'flags.isDeleted': false });
};

UserSchema.statics.findByUsername = function (username: string) {
    return this.findOne({ username: username.toLowerCase() });
};

UserSchema.statics.findByUserId = async function (userId: string): Promise<IUser | null> {
    return this.findOne({ userId, 'flags.isDeleted': false });
};

UserSchema.statics.getActiveUserCount = async function (): Promise<number> {
    return this.countDocuments({ status: 'active', 'flags.isDeleted': false });
};

// 🔧 NAYA — Feature 40: paginated user search
// Query string ko firstName/lastName/username/company/location ke against
// case-insensitive partial (regex) match karta hai. Deleted/inactive users
// exclude hote hain.
UserSchema.statics.findUsersPaginated = async function (options: {
    page: number;
    limit: number;
    query: string;
    region?: string;
    useEstimatedCount?: boolean;
    projection?: string;
}): Promise<IPaginatedUsersResult> {
    const { page = 1, limit = 20, query, useEstimatedCount = true, projection } = options;

    if (!query || !query.trim()) {
        return {
            data: [],
            totalCount: 0,
            currentPage: page,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            estimatedTotal: 0,
        };
    }

    const skip = (page - 1) * limit;
    const trimmedQuery = query.trim();

    // Case-insensitive partial match. MongoDB ka $text sirf whole-word match
    // karta hai, isliye "kas" jaisi partial typing ke liye regex use kar rahe hain.
    // Special regex characters escape kiye hain taaki user input crash na kare.
    const escapedQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedQuery, 'i');

    const filter: any = {
        'flags.isDeleted': false,
        status: 'active',
        $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { username: searchRegex },
            { company: searchRegex },
            { location: searchRegex },
        ],
    };

    const selectFields =
        projection || 'userId username firstName lastName location company profilePhotoId';

    const [data, totalCount] = await Promise.all([
        this.find(filter).select(selectFields).skip(skip).limit(limit).lean(),
        this.countDocuments(filter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return {
        data,
        totalCount,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        estimatedTotal: totalCount,
    };
};

UserSchema.methods.incrementLoginAttempts = async function (): Promise<any> {
    if (this.lockUntil && this.lockUntil < new Date()) {
        return this.updateOne({
            $set: { loginAttempts: 1 },
            $unset: { lockUntil: 1, accountLockedReason: 1 },
        });
    }
    const updates: any = { $inc: { loginAttempts: 1 } };
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_TIME = 15 * 60 * 1000;
    if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.isLocked) {
        updates.$set = {
            lockUntil: new Date(Date.now() + LOCK_TIME),
            accountLockedReason: 'too_many_attempts',
        };
    }
    return this.updateOne(updates);
};

UserSchema.methods.resetLoginAttempts = async function (): Promise<any> {
    return this.updateOne({
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1, accountLockedReason: 1 },
    });
};

UserSchema.methods.generateEmailVerificationToken = function (): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
    this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return token;
};

UserSchema.methods.generatePasswordResetToken = function (): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    return token;
};

UserSchema.methods.verifyEmail = async function (this: IUser): Promise<IUser> {
    this.emailVerified = true;
    this.emailVerificationToken = undefined;
    this.emailVerificationExpires = undefined;
    await this.save();
    userEmitter.emit('user:email_verified', { userId: this.userId, email: this.email, timestamp: new Date() });
    return this;
};

UserSchema.methods.updateLastLogin = async function (this: IUser, ipAddress: string): Promise<IUser> {
    this.lastLoginAt = new Date();
    this.lastLoginIp = ipAddress;
    this.metadata.lastActiveAt = new Date();
    this.metadata.totalLogins = (this.metadata.totalLogins || 0) + 1;
    await this.save();
    const cacheKey = `${Constants.CACHE_PREFIXES.USER}${this.userId}`;
    await CacheUtil.set(
        cacheKey,
        JSON.stringify({ userId: this.userId, emailVerified: this.emailVerified }),
        Constants.CACHE_TTLS.USER
    );
    return this;
};

UserSchema.methods.softDelete = async function (this: IUser, deletedBy: string = 'user'): Promise<IUser> {
    this.status = 'deleted';
    this.flags.isDeleted = true;
    this.flags.deletedAt = new Date();
    this.flags.deletedBy = deletedBy;
    await this.save();
    userEmitter.emit('user:deleted', { userId: this.userId, deletedBy, timestamp: new Date() });
    return this;
};

UserSchema.methods.trackActivityTime = async function () {
    const hour = new Date().getHours();
    if (!this.activityPattern.activeHours.includes(hour)) {
        this.activityPattern.activeHours.push(hour);
    }
    const hourCounts: { [key: number]: number } = {};
    this.activityPattern.activeHours.forEach((h: number) => {
        hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const peakHour = Object.keys(hourCounts).reduce((a, b) =>
        hourCounts[parseInt(a)] > hourCounts[parseInt(b)] ? a : b
    );
    this.activityPattern.peakEngagementTime = `${peakHour}:00-${parseInt(peakHour) + 1}:00`;
    this.activityPattern.lastUpdated = new Date();
    await this.save();
};

const User = mongoose.model<IUser, IUserModel>('User', UserSchema);
export default User;