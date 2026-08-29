import mongoose, { Schema, Document, Model } from 'mongoose';
import validator from 'validator';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import NodeCache from 'node-cache';
import { LoggerUtil } from '@/shared/logger.util';
import userEmitter from '@/shared/events/emitters/user.emitter';

const logger = LoggerUtil;

const userProfileCache = new NodeCache({
    stdTTL: 300,
    checkperiod: 60,
    useClones: false,
});

const s3Client = new S3Client({
    region: process.env['AWS_REGION'] || 'us-east-1',
    credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
    },
});

export interface IAvatar {
    url?: string;
    thumbnails?: {
        small?: string;
        medium?: string;
        large?: string;
    };
    uploadedAt?: Date;
    size?: number;
    format?: string;
}

export interface IContact {
    email?: string;
    phone?: {
        number?: string;
        countryCode?: string;
        verified: boolean;
    };
}

export interface ILocation {
    country?: string;
    city?: string;
    timezone: string;
}

export interface ISocial {
    website?: string;
    twitter?: string;
    github?: string;
}

export interface IPreferences {
    language: string;
    notifications: {
        email: boolean;
        push: boolean;
    };
}

export interface IStats {
    followers: number;
    following: number;
    posts: number;
}

export interface IFlags {
    isActive: boolean;
    isSuspended: boolean;
}

export interface IMetadata {
    lastProfileUpdate: Date;
    profileCompleteness: number;
    searchableText?: string;
}

export interface IUserProfile extends Document {
    userId: string;
    username: string;
    displayName: string;
    bio: string;
    avatar?: IAvatar;
    contact?: IContact;
    location?: ILocation;
    social?: ISocial;
    preferences: IPreferences;
    stats: IStats;
    flags: IFlags;
    metadata: IMetadata;
    createdAt: Date;
    updatedAt: Date;
    publicProfile: any;
    uploadAvatar(imageBuffer: Buffer, mimetype: string): Promise<IAvatar>;
    updateStats(field: string, increment?: number): Promise<boolean>;
}

export interface IUserProfileModel extends Model<IUserProfile> {
    createProfile(data: Partial<IUserProfile>): Promise<IUserProfile>;
    findByUserIdCached(userId: string): Promise<IUserProfile | null>;
    clearUserCache(userId: string): void;
    clearAllCache(): void;
    calculateCompleteness(data: any): number;
    generateSearchableText(data: any): string;
    generateUniqueUsername(base: string): Promise<string>;
}

const userProfileSchema = new Schema<IUserProfile, IUserProfileModel>(
    {
        userId: {
            type: String,
            required: true,
            unique: true
        },
        username: {
            type: String,
            required: true,
            unique: true,
            // ✅ FIX:  HATAYA
            // unique: true apne aap index banata hai — dono saath DUPLICATE tha
            lowercase: true,
            trim: true,
            minlength: 3,
            maxlength: 30,
            match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
        },
        bio: {
            type: String,
            trim: true,
            maxlength: 500,
            default: '',
        },
        avatar: {
            url: String,
            thumbnails: {
                small: String,
                medium: String,
                large: String,
            },
            uploadedAt: Date,
            size: Number,
            format: String,
        },
        contact: {
            email: {
                type: String,
                lowercase: true,
                trim: true,
                validate: [validator.isEmail, 'Invalid email format'],
            },
            phone: {
                number: String,
                countryCode: String,
                verified: { type: Boolean, default: false },
            },
        },
        location: {
            country: String,
            city: String,
            timezone: { type: String, default: 'UTC' },
        },
        social: {
            website: String,
            twitter: String,
            github: String,
        },
        preferences: {
            language: {
                type: String,
                default: 'en',
                enum: ['en', 'es', 'fr', 'de', 'hi'],
            },
            notifications: {
                email: { type: Boolean, default: true },
                push: { type: Boolean, default: true },
            },
        },
        stats: {
            followers: { type: Number, default: 0, min: 0 },
            following: { type: Number, default: 0, min: 0 },
            posts: { type: Number, default: 0, min: 0 },
        },
        flags: {
            isActive: { type: Boolean, default: true },
            isSuspended: { type: Boolean, default: false },
        },
        metadata: {
            lastProfileUpdate: { type: Date, default: Date.now },
            profileCompleteness: { type: Number, default: 0, min: 0, max: 100 },
            searchableText: String,
        },
    },
    {
        timestamps: true,
        collection: 'user_profiles',
        shardKey: { userId: 'hashed' },
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ==================== INDEXES ====================
// ✅ Sirf compound indexes yahan — single field indexes upar unique:true se handle hain
userProfileSchema.index({ username: 1, 'flags.isActive': 1 });
userProfileSchema.index({ 'metadata.searchableText': 'text' });
userProfileSchema.index({ 'stats.followers': -1, 'flags.isActive': 1 });

// ==================== VIRTUALS ====================
userProfileSchema.virtual('publicProfile').get(function (this: IUserProfile) {
    const profile: any = {
        userId: this.userId,
        username: this.username,
        displayName: this.displayName,
        bio: this.bio,
        avatar: this.avatar,
        stats: this.stats,
    };
    if (this.preferences.notifications.email) {
        profile.contact = { email: this.contact?.email };
    }
    return profile;
});

// ==================== STATIC METHODS ====================
userProfileSchema.statics.findByUserIdCached = async function (userId: string): Promise<IUserProfile | null> {
    if (!userId) return null;
    try {
        const cacheKey = `user_profile_${userId}`;
        const cachedProfile = userProfileCache.get<IUserProfile>(cacheKey);
        if (cachedProfile) return cachedProfile;

        const userProfile = await this.findOne({ userId }).select('-__v').lean();
        if (userProfile) userProfileCache.set(cacheKey, userProfile);
        return userProfile as IUserProfile | null;
    } catch (error: any) {
        logger.error('Error fetching user profile', { userId, error: (error as Error).message });
        return null;
    }
};

userProfileSchema.statics.clearUserCache = function (userId: string): void {
    if (!userId) return;
    userProfileCache.del(`user_profile_${userId}`);
};

userProfileSchema.statics.clearAllCache = function (): void {
    userProfileCache.flushAll();
};

userProfileSchema.statics.createProfile = async function (data: Partial<IUserProfile>): Promise<IUserProfile> {
    try {
        if (!data.username) {
            data.username = await this.generateUniqueUsername(data.displayName || 'user');
        }
        data.metadata = {
            lastProfileUpdate: new Date(),
            profileCompleteness: this.calculateCompleteness(data),
            searchableText: this.generateSearchableText(data),
        };
        const profile = new this(data);
        await profile.save();
        userEmitter.emit('profile:created', { userId: profile.userId, username: profile.username });
        return profile;
    } catch (error: any) {
        logger.error('Profile creation failed', { error: (error as Error).message });
        throw error;
    }
};

userProfileSchema.statics.calculateCompleteness = function (data: any): number {
    let score = 0;
    if (data.avatar?.url) score += 20;
    if (data.bio && data.bio.length > 20) score += 15;
    if (data.contact?.email) score += 20;
    if (data.location?.country && data.location?.city) score += 15;
    if (Object.values(data.social || {}).filter(Boolean).length) score += 15;
    if (data.preferences?.language) score += 10;
    return Math.min(score, 100);
};

userProfileSchema.statics.generateSearchableText = function (data: any): string {
    return [data.username, data.displayName, data.bio, data.location?.country, data.location?.city]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
};

userProfileSchema.statics.generateUniqueUsername = async function (base: string): Promise<string> {
    const cleanBase = base.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    let username = cleanBase;
    let suffix = 0;
    while (await this.exists({ username })) {
        username = `${cleanBase}${suffix || Math.floor(Math.random() * 10000)}`;
        suffix++;
    }
    return username;
};

// ==================== INSTANCE METHODS ====================
userProfileSchema.methods.uploadAvatar = async function (imageBuffer: Buffer, mimetype: string): Promise<IAvatar> {
    try {
        const userId = this.userId;
        const timestamp = Date.now();
        const bucket = process.env['AWS_S3_BUCKET'] || 'default-bucket';
        const cdnDomain = process.env['AWS_CDN_DOMAIN'] || 's3.amazonaws.com';
        const sizes = [
            { name: 'small', width: 64 },
            { name: 'medium', width: 128 },
            { name: 'large', width: 256 },
            { name: 'original', width: 512 },
        ];

        const uploads = await Promise.all(
            sizes.map(async ({ name, width }) => {
                const processed = await sharp(imageBuffer)
                    .resize(width, width, { fit: 'cover' })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                const key = `avatars/${userId}/${timestamp}_${name}.jpg`;
                await s3Client.send(
                    new PutObjectCommand({
                        Bucket: bucket,
                        Key: key,
                        Body: processed,
                        ContentType: 'image/jpeg',
                        CacheControl: 'max-age=31536000',
                        Metadata: { userId, uploadedAt: new Date().toISOString() },
                    })
                );
                return { name, url: `https://${cdnDomain}/${key}` };
            })
        );

        this.avatar = {
            url: uploads.find((u) => u.name === 'original')?.url,
            thumbnails: {
                small: uploads.find((u) => u.name === 'small')?.url,
                medium: uploads.find((u) => u.name === 'medium')?.url,
                large: uploads.find((u) => u.name === 'large')?.url,
            },
            uploadedAt: new Date(),
            size: imageBuffer.length,
            format: 'jpeg',
        };

        await this.save();
        (this.constructor as IUserProfileModel).clearUserCache(userId);
        userEmitter.emit('profile:avatar_updated', { userId, avatarUrl: this.avatar.url });
        return this.avatar;
    } catch (error: any) {
        logger.error('Avatar upload failed', { error: (error as Error).message });
        throw error;
    }
};

userProfileSchema.methods.updateStats = async function (field: string, increment: number = 1): Promise<boolean> {
    try {
        await (this.constructor as IUserProfileModel).updateOne(
            { _id: this._id },
            { $inc: { [`stats.${field}`]: increment } }
        );
        (this.constructor as IUserProfileModel).clearUserCache(this.userId);
        userEmitter.emit('profile:stats_updated', { userId: this.userId, field, value: increment });
        return true;
    } catch (error: any) {
        logger.error('Stats update failed', { error: (error as Error).message });
        throw error;
    }
};

// ==================== PRE-SAVE HOOK ====================
userProfileSchema.pre('save', async function (next) {
    if (this.isModified()) {
        this.metadata.lastProfileUpdate = new Date();
        this.metadata.profileCompleteness = (this.constructor as IUserProfileModel).calculateCompleteness(this);
        this.metadata.searchableText = (this.constructor as IUserProfileModel).generateSearchableText(this);
        (this.constructor as IUserProfileModel).clearUserCache(this.userId);
    }
    next();
});

// ==================== EXPORT ====================
const UserProfile = mongoose.model<IUserProfile, IUserProfileModel>('UserProfile', userProfileSchema);
export default UserProfile;