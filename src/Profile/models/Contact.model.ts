/**
 * Contact Model - User Contact Information
 * Stores contact details with privacy controls
 * 
 * @module models/Contact.model
 * @version 1.0.0
 */

import { LoggerUtil } from '@/shared/logger.util';
import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

export interface IPhone {
    phoneNumber: string;
    type: 'mobile' | 'home' | 'work';
    isPrimary: boolean;
    countryCode?: string;
}

export interface IWebsite {
    url: string;
    type: 'personal' | 'company' | 'portfolio' | 'blog' | 'social' | 'other';
    label?: string;
}

export interface IAddress {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    fullAddress?: string;  // Complete address as single string
}

export interface IBirthday {
    day: number;           // 1-31
    month: number;         // 1-12
    year?: number;         // Optional if hideYear is true
    hideYear: boolean;
}

export interface IContact extends Document {
    contactId: string;
    userId: string;

    // Profile URL (Custom Vanity)
    profileUrl?: string;   // e.g., "john-doe" -> linkedin.com/in/john-doe

    // Phone Numbers (up to 3)
    phones: IPhone[];

    // Birthday
    birthday?: IBirthday;

    // Address/Location
    address?: IAddress;

    // Websites (up to 3)
    websites: IWebsite[];

    // Privacy Settings
    privacy: {
        phoneVisibility: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility: 'public' | 'connections' | 'private' | 'me_only';
    };

    // Metadata
    createdAt: Date;
    updatedAt: Date;

    // Soft Delete / Archive
    isDeleted: boolean;
    deletedAt?: Date;
    isArchived: boolean;
    archivedAt?: Date;

    // Virtuals
    primaryPhone?: string;
    age?: number;
}

export interface IContactModel extends Model<IContact> {
    findByUserId(userId: string): Promise<IContact | null>;
    findActiveById(contactId: string, userId: string): Promise<IContact | null>;
    checkProfileUrlAvailability(profileUrl: string, excludeContactId?: string): Promise<boolean>;
}

// ==================== SCHEMA ====================

const PhoneSchema = new Schema({
    phoneNumber: {
        type: String,
        required: [true, 'Phone number is required'],
        validate: {
            validator: (v: string) => /^\+?[1-9]\d{9,14}$/.test(v),
            message: 'Invalid phone number format',
        },
    },
    type: {
        type: String,
        enum: ['mobile', 'home', 'work'],
        default: 'mobile',
    },
    isPrimary: {
        type: Boolean,
        default: false,
    },
    countryCode: {
        type: String,
        maxlength: 5,
    },
}, { _id: false });

const WebsiteSchema = new Schema({
    url: {
        type: String,
        required: [true, 'Website URL is required'],
        maxlength: [500, 'URL cannot exceed 500 characters'],
        validate: {
            validator: (v: string) => {
                try {
                    new URL(v);
                    return true;
                } catch {
                    return false;
                }
            },
            message: 'Invalid URL format',
        },
    },
    type: {
        type: String,
        enum: ['personal', 'company', 'portfolio', 'blog', 'social', 'other'],
        default: 'personal',
    },
    label: {
        type: String,
        maxlength: [50, 'Label cannot exceed 50 characters'],
    },
}, { _id: false });

const AddressSchema = new Schema({
    street: {
        type: String,
        maxlength: [200, 'Street cannot exceed 200 characters'],
    },
    city: {
        type: String,
        maxlength: [100, 'City cannot exceed 100 characters'],
    },
    state: {
        type: String,
        maxlength: [100, 'State cannot exceed 100 characters'],
    },
    country: {
        type: String,
        maxlength: [100, 'Country cannot exceed 100 characters'],
    },
    postalCode: {
        type: String,
        maxlength: [20, 'Postal code cannot exceed 20 characters'],
    },
    fullAddress: {
        type: String,
        maxlength: [500, 'Full address cannot exceed 500 characters'],
    },
}, { _id: false });

const BirthdaySchema = new Schema({
    day: {
        type: Number,
        required: [true, 'Day is required'],
        min: [1, 'Day must be between 1 and 31'],
        max: [31, 'Day must be between 1 and 31'],
    },
    month: {
        type: Number,
        required: [true, 'Month is required'],
        min: [1, 'Month must be between 1 and 12'],
        max: [12, 'Month must be between 1 and 12'],
    },
    year: {
        type: Number,
        min: [1900, 'Year must be after 1900'],
        max: [new Date().getFullYear() - 13, 'User must be at least 13 years old'],
    },
    hideYear: {
        type: Boolean,
        default: false,
    },
}, { _id: false });

const ContactSchema = new Schema<IContact, IContactModel>(
    {
        contactId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            index: true,
            immutable: true,
        },
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            unique: true,  // One contact per user
            // // index: true,
            validate: {
                validator: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
                message: 'Invalid User ID format',
            },
        },

        // ==================== PROFILE URL ====================
        profileUrl: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
            minlength: [3, 'Profile URL must be at least 3 characters'],
            maxlength: [50, 'Profile URL cannot exceed 50 characters'],
            validate: {
                validator: (v: string) => !v || /^[a-z0-9_-]+$/.test(v),
                message: 'Profile URL can only contain lowercase letters, numbers, underscore, and hyphen',
            },
            // index: true,
        },

        // ==================== PHONES ====================
        phones: {
            type: [PhoneSchema],
            default: [],
            validate: {
                validator: (v: IPhone[]) => v.length <= 3,
                message: 'Maximum 3 phone numbers allowed',
            },
        },

        // ==================== BIRTHDAY ====================
        birthday: {
            type: BirthdaySchema,
            default: null,
        },

        // ==================== ADDRESS ====================
        address: {
            type: AddressSchema,
            default: null,
        },

        // ==================== WEBSITES ====================
        websites: {
            type: [WebsiteSchema],
            default: [],
            validate: {
                validator: (v: IWebsite[]) => v.length <= 3,
                message: 'Maximum 3 websites allowed',
            },
        },

        // ==================== PRIVACY SETTINGS ====================
        privacy: {
            phoneVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'connections',
            },
            birthdayVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'connections',
            },
            addressVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'private',
            },
            phoneDiscovery: {
                type: String,
                enum: ['anyone', 'connections_only', 'no_one'],
                default: 'connections_only',
            },
            contactButtonVisibility: {
                type: String,
                enum: ['public', 'connections', 'private', 'me_only'],
                default: 'public',
            },
        },

        // ==================== SOFT DELETE / ARCHIVE ====================
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
        },
        archivedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'contacts',
        toJSON: {
            virtuals: true,
            transform: function (_doc, ret: any) {
                delete ret.__v;
                return ret;
            },
        },
        toObject: {
            virtuals: true,
        },
    }
);

// ==================== INDEXES ====================

ContactSchema.index({ userId: 1, isDeleted: 1 });
// Removed duplicate index: ContactSchema.index({ profileUrl: 1 }, { unique: true, sparse: true });
ContactSchema.index({ createdAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Get primary phone number
 */
ContactSchema.virtual('primaryPhone').get(function (this: IContact) {
    const primary = this.phones.find(p => p.isPrimary);
    return primary ? primary.phoneNumber : (this.phones[0]?.phoneNumber || null);
});

/**
 * Calculate age from birthday
 */
ContactSchema.virtual('age').get(function (this: IContact) {
    if (!this.birthday || !this.birthday.year) return null;

    const today = new Date();
    const birthDate = new Date(this.birthday.year, this.birthday.month - 1, this.birthday.day);

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
});

// ==================== MIDDLEWARE ====================

/**
 * Pre-save: Ensure only one primary phone
 */
ContactSchema.pre('save', function (next) {
    if (this.phones && this.phones.length > 0) {
        const primaryCount = this.phones.filter(p => p.isPrimary).length;

        if (primaryCount === 0) {
            // Set first phone as primary
            this.phones[0].isPrimary = true;
        } else if (primaryCount > 1) {
            // Keep only first primary, unset others
            let foundPrimary = false;
            this.phones.forEach(phone => {
                if (phone.isPrimary && !foundPrimary) {
                    foundPrimary = true;
                } else {
                    phone.isPrimary = false;
                }
            });
        }
    }
    next();
});

/**
 * Pre-save: Validate birthday date
 */
ContactSchema.pre('save', function (next) {
    if (this.birthday) {
        const { day, month, year } = this.birthday;

        // Validate date
        const daysInMonth = new Date(year || 2000, month, 0).getDate();
        if (day > daysInMonth) {
            return next(new Error(`Invalid date: Day ${day} does not exist in month ${month}`));
        }
    }
    next();
});

// ==================== STATIC METHODS ====================

/**
 * Find contact by userId
 */
ContactSchema.statics.findByUserId = async function (userId: string): Promise<IContact | null> {
    try {
        return await this.findOne({ userId, isDeleted: false }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find contact by userId failed', {
            error: (error as Error).message,
            userId,
        });
        throw error;
    }
};

/**
 * Find active contact by ID
 */
ContactSchema.statics.findActiveById = async function (contactId: string, userId: string): Promise<IContact | null> {
    try {
        return await this.findOne({
            contactId,
            userId,
            isDeleted: false,
        }).exec();
    } catch (error : any) {
        LoggerUtil.error('Find active contact by ID failed', {
            error: (error as Error).message,
            contactId,
            userId,
        });
        throw error;
    }
};

/**
 * Check profile URL availability
 */
ContactSchema.statics.checkProfileUrlAvailability = async function (
    profileUrl: string,
    excludeContactId?: string
): Promise<boolean> {
    try {
        const query: any = {
            profileUrl: profileUrl.toLowerCase(),
            isDeleted: false,
        };

        if (excludeContactId) {
            query.contactId = { $ne: excludeContactId };
        }

        const existing = await this.findOne(query).exec();
        return !existing;
    } catch (error : any) {
        LoggerUtil.error('Check profile URL availability failed', {
            error: (error as Error).message,
            profileUrl,
        });
        throw error;
    }
};

// ==================== EXPORT ====================

const Contact = mongoose.model<IContact, IContactModel>('Contact', ContactSchema);
export default Contact;